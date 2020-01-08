# -*- coding: utf-8 -*-
# Part of Inceptus ERP Solutions Pvt.ltd.
# See LICENSE file for copyright and licensing details.

from odoo import models, fields, api, _, SUPERUSER_ID
from odoo.exceptions import UserError
from odoo.tools import DEFAULT_SERVER_DATETIME_FORMAT
import time


class POSConfig(models.Model):
    _name = 'pos.config'

    _inherit = ["pos.config", "ies.base"]

    sale_journal = fields.Many2one('account.journal', 'Sale Journal', help="User can choose the Gift Card sale journal, all sale entries related to Gift Card sales will be entered in this journal")
    reedem_journal = fields.Many2one('account.journal', "Reedem Journal", help="User can choose the Gift Card to redeem journal, all redeeming entries related to Gift Card redeem, will be entered in this journal")
    coupon_mode = fields.Selection([('off', 'Offline'), ('on', 'Online'), ('onf', 'Online & Offline')], "Mode", default='off', help="")
    allow_discount = fields.Boolean("Allow Discount on giftcard?")
    # allow_percentage = fields.Boolean("Percentage Giftcard Sale", help="Allow Giftcard With Percentage?", default=True)
    allow_coupon_reedem = fields.Boolean("Reeedem Coupon on Giftcard?", help='Allow coupons reedem on the giftcard?')


class PosSession(models.Model):
    _name = 'pos.session'

    _inherit = ["pos.session", "ies.base"]

    @api.model
    def create(self, values):
        res = super(PosSession, self).create(values)
        ABS = self.env['account.bank.statement']
        config_id = values.get('config_id') or self.env.context.get('default_config_id')
        pos_config = self.env['pos.config'].browse(config_id)
        ctx = dict(self.env.context, company_id=pos_config.company_id.id)
        uid = SUPERUSER_ID if self.env.user.has_group('point_of_sale.group_pos_user') else self.env.user.id
        if not pos_config.reedem_journal:
            raise UserError(_("Reedem Journal is not configured."))
        st_values = {
            'journal_id': pos_config.reedem_journal.id,
            'user_id': self.env.user.id,
            'name': res.name
        }
        coupon_statement = ABS.with_context(ctx).with_user(uid).create(st_values)
        res.statement_ids = [(4, coupon_statement.id)]
        return res

    def _confirm_orders(self):
        """
            will create coupon account move
        """
        for session in self:
            company_id = session.config_id.journal_id.company_id.id
            orders = session.order_ids.filtered(lambda order: order.state == 'paid')
            giftcard = False
            move = False
            for order in orders:
                for line in order.lines:
                    if line.product_id.is_coupon:
                        giftcard = True
                        break
            if not session.config_id.sale_journal:
                raise UserError(_("Please configure Giftcards Sale journal in :%s") % (session.config_id.name,))
            if giftcard:
                move = self.env['pos.order'].with_context(force_company=company_id)._create_account_move \
                    (session.start_at, session.name, session.config_id.sale_journal.id, company_id)
        return super(PosSession, self.with_context(coupon_move=move))._confirm_orders()


class POSOrderLine(models.Model):
    _name = 'pos.order.line'

    _inherit = ["pos.order.line", "ies.base"]

    # @api.multi
    @api.depends('discount', 'product_id', 'qty')
    def _get_discount_string(self):
        for rec in self:
            if rec.product_id.is_coupon and rec.qty > 0:
                rec.discount_string = "%.2f %s" % (rec.discount, rec.company_id.currency_id.symbol or '')
            else:
                rec.discount_string = "%.2f %s" % (rec.discount, "%")

    coupon_id = fields.Many2one("product.coupon", "Related Giftcard")
    discount_string = fields.Char("Discount", compute="_get_discount_string")
    price_subtotal = fields.Float(compute='_compute_amount_line_all', digits=0, string='Subtotal w/o Tax')
    price_subtotal_incl = fields.Float(compute='_compute_amount_line_all', digits=0, string='Subtotal')

    @api.depends('price_unit', 'tax_ids', 'qty', 'discount', 'product_id')
    def _compute_amount_line_all(self):
        for line in self:
            fpos = line.order_id.fiscal_position_id
            tax_ids_after_fiscal_position = fpos.map_tax(line.tax_ids, line.product_id,
                                                         line.order_id.partner_id) if fpos else line.tax_ids
            price = 0.0
            if line.product_id.is_coupon and line.qty > 0:
                price = line.price_unit - line.discount or 0.0
            else:
                price = line.price_unit * (1 - (line.discount or 0.0) / 100.0)

            taxes = tax_ids_after_fiscal_position.compute_all(price, line.order_id.pricelist_id.currency_id, line.qty,
                                                              product=line.product_id, partner=line.order_id.partner_id)
            line.update({
                'price_subtotal_incl': taxes['total_included'],
                'price_subtotal': taxes['total_excluded'],
            })


class POSOrder(models.Model):
    _name = 'pos.order'

    _inherit = ["pos.order", "ies.base"]

    coupon_reedem_ids = fields.One2many('coupon.reedem', 'order_id', 'Reedem Ref')

    @api.model
    def _order_fields(self, ui_order):
        res = super(POSOrder, self)._order_fields(ui_order)
        res.update({'coupon_reedem_ids': ui_order.get('coupon_reedem_ids') and ui_order['coupon_reedem_ids']})
        return res

    @api.model
    def update_coupon(self, coupon):
        coupon_env = self.env['product.coupon']
        if not coupon.get('id'):
            coupon_rec = coupon_env.search([('name', '=', coupon.get('name'))], limit=1)
        else:
            coupon_rec = coupon_env.browse(coupon.get('id'))
        vals = {}
        coupon_rec.rem_amount = coupon.get('rem_amount')
        if coupon.get('rem_amount') > 0:
            vals['state'] = 'pr'
        else:
            vals['state'] = 'r'

        # vals['reedem_date'] = time.strftime(DEFAULT_SERVER_DATETIME_FORMAT)  # change in case of offline
        coupon_rec.write(vals)
        return coupon_rec

    @api.model
    def create_from_ui(self, orders):
        for order in orders:
            if not order.get('data').get('lines'):
                continue
            # lines = order.get('data').get('lines')
            reedem_lines = []
            for line in order.get('data').get('lines'):
                line_data = line[2]
                if not line_data.get('coupon'):
                    continue
                coupon_id = line_data.get('coupon') and line_data.get('coupon').get('id')
                line[2]['coupon_id'] = coupon_id
                coupon_rec = self.env['product.coupon'].browse(coupon_id)
                if order.get('data').get('partner_id'):
                    coupon_rec.partner_id = order.get('data').get('partner_id')
                if line_data.get('qty') > 0:
                    if coupon_rec.type in ['d', 'f']:
                        coupon_rec.amount = line_data.get('price_unit')
                        coupon_rec.rem_amount = line_data.get('price_unit')
                        coupon_rec.state = 's'
                    else:
                        coupon_rec.rem_amount -= line_data.get('price_unit')
                    coupon_rec.sale_date = order.get('data').get('creation_date')
                    if coupon_rec.product_id.expiry_type == 'as':
                        product_id = coupon_rec.product_id
                        expiry_date = self.env['product.template'].compute_expiry_date(product_id.expiry_unit,
                                                                                       product_id.expiry_interval)
                        coupon_rec.write({'expire_date': expiry_date})
                else:
                    coupon = self.update_coupon(line_data.get('coupon'))
                    order.get('data').get('lines').pop(order.get('data').get('lines').index(line))
                    reedem_lines.append((0, 0, {
                        'coupon_id': coupon.id,
                        'date': time.strftime(DEFAULT_SERVER_DATETIME_FORMAT),
                        'amount': line_data.get('price_unit'),
                        'shop_id': False
                    }))
            order.get('data')['coupon_reedem_ids'] = reedem_lines
        res = super(POSOrder, self).create_from_ui(orders)
        return res

    @api.model
    def create(self, vals):
        res = super(POSOrder, self).create(vals)
        for line in res.lines:
            if line.coupon_id:
                line.coupon_id.pos_order_id = res.id
        return res

    def _action_create_invoice_line(self, line=False, invoice_id=False):
        '''adds related gftcards to the invoice line'''
        res = super(POSOrder, self)._action_create_invoice_line(line, invoice_id)
        res.coupon_id = line.coupon_id.id
        return res

    def _create_account_move_line(self, session=None, move=None):
        """OverWrite: Create a account move line of order grouped by products or not.
        need to insert coupons move lines"""
        IrProperty = self.env['ir.property']
        ResPartner = self.env['res.partner']

        if session and not all(session.id == order.session_id.id for order in self):
            raise UserError(_('Selected orders do not have the same session!'))

        grouped_data = {}
        coupon_move = self._context.get('coupon_move')

        have_to_group_by = session and session.config_id.group_by or False
        rounding_method = session and session.config_id.company_id.tax_calculation_rounding_method

        for order in self.filtered(lambda o: not o.account_move or order.state == 'paid'):
            cd_amt, cc_amt = 0.0, 0.0
            current_company = order.sale_journal.company_id
            account_def = IrProperty.get(
                'property_account_receivable_id', 'res.partner')
            order_account = order.partner_id.property_account_receivable_id.id or account_def and account_def.id
            partner_id = ResPartner._find_accounting_partner(order.partner_id).id or False
            if move is None:
                # Create an entry for the sale
                journal_id = self.env['ir.config_parameter'].sudo().get_param(
                    'pos.closing.journal_id_%s' % current_company.id, default=order.sale_journal.id)
                move = self._create_account_move(
                    order.session_id.start_at, order.name, int(journal_id), order.company_id.id)

            def insert_data(data_type, values):
                # if have_to_group_by:
                values.update({
                    'partner_id': partner_id,
                    'move_id': move.id,
                })

                if data_type == 'product':
                    key = ('product', values['partner_id'],
                           (values['product_id'], tuple(values['tax_ids'][0][2]), values['name']),
                           values['analytic_account_id'], values['debit'] > 0)
                elif data_type == 'coupon':
                    key = ('coupon', values['partner_id'],
                           (values['product_id'], tuple(values['tax_ids'][0][2]), values['name']),
                           values['analytic_account_id'], values['debit'] > 0)
                    if coupon_move:
                        values.update({'move_id': coupon_move.id})
                elif data_type == 'tax':
                    key = ('tax', values['partner_id'], values['tax_line_id'], values['debit'] > 0)
                elif data_type == 'counter_part':
                    key = ('counter_part', values['partner_id'], values['account_id'], values['debit'] > 0)
                elif data_type == 'coupon_counter_part':
                    key = ('coupon_counter_part', values['partner_id'], values['account_id'], values['debit'] > 0)
                    if coupon_move:
                        values.update({'move_id': coupon_move.id})
                else:
                    return

                grouped_data.setdefault(key, [])

                if have_to_group_by:
                    if not grouped_data[key]:
                        grouped_data[key].append(values)
                    else:
                        current_value = grouped_data[key][0]
                        current_value['quantity'] = current_value.get('quantity', 0.0) + values.get('quantity', 0.0)
                        current_value['credit'] = current_value.get('credit', 0.0) + values.get('credit', 0.0)
                        current_value['debit'] = current_value.get('debit', 0.0) + values.get('debit', 0.0)
                else:
                    grouped_data[key].append(values)

            # because of the weird way the pos order is written, we need to make sure there is at least one line,
            # because just after the 'for' loop there are references to 'line' and 'income_account' variables (that
            # are set inside the for loop)
            # TOFIX: a deep refactoring of this method (and class!) is needed
            # in order to get rid of this stupid hack
            assert order.lines, _('The POS order must have lines when calling this method')
            # Create an move for each order line
            cur = order.pricelist_id.currency_id
            has_coupon = False
            for line in order.lines:
                amount = line.price_subtotal

                # Search for the income account
                if line.product_id.property_account_income_id.id:
                    income_account = line.product_id.property_account_income_id.id
                elif line.product_id.categ_id.property_account_income_categ_id.id:
                    income_account = line.product_id.categ_id.property_account_income_categ_id.id
                else:
                    raise UserError(_('Please define income '
                                      'account for this product: "%s" (id:%d).')
                                    % (line.product_id.name, line.product_id.id))

                name = line.product_id.name
                if line.notice:
                    # add discount reason in move
                    name = name + ' (' + line.notice + ')'

                # Create a move for the line for the order line
                if line.product_id.is_coupon:
                    giftcard_account = coupon_move.journal_id.default_credit_account_id and \
                                          coupon_move.journal_id.default_credit_account_id.id
                    has_coupon = True
                    insert_data('coupon', {
                        'name': name,
                        'quantity': line.qty,
                        'product_id': line.product_id.id,
                        'account_id': giftcard_account,
                        'analytic_account_id': self._prepare_analytic_account(line),
                        'credit': ((amount > 0) and amount) or 0.0,
                        'debit': ((amount < 0) and -amount) or 0.0,
                        'tax_ids': [(6, 0, line.tax_ids_after_fiscal_position.ids)],
                        'partner_id': partner_id
                    })
                    if amount > 0:
                        cc_amt += amount
                    else:
                        cd_amt += -amount
                else:
                    insert_data('product', {
                        'name': name,
                        'quantity': line.qty,
                        'product_id': line.product_id.id,
                        'account_id': income_account,
                        'analytic_account_id': self._prepare_analytic_account(line),
                        'credit': ((amount > 0) and amount) or 0.0,
                        'debit': ((amount < 0) and -amount) or 0.0,
                        'tax_ids': [(6, 0, line.tax_ids_after_fiscal_position.ids)],
                        'partner_id': partner_id
                    })

                # Create the tax lines
                taxes = line.tax_ids_after_fiscal_position.filtered(lambda t: t.company_id.id == current_company.id)
                if not taxes:
                    continue
                price = line.price_unit * (1 - (line.discount or 0.0) / 100.0)
                for tax in taxes.compute_all(price, cur, line.qty)['taxes']:
                    insert_data('tax', {
                        'name': _('Tax') + ' ' + tax['name'],
                        'product_id': line.product_id.id,
                        'quantity': line.qty,
                        'account_id': tax['account_id'] or income_account,
                        'credit': ((tax['amount'] > 0) and tax['amount']) or 0.0,
                        'debit': ((tax['amount'] < 0) and -tax['amount']) or 0.0,
                        'tax_line_id': tax['id'],
                        'partner_id': partner_id
                    })

            # round tax lines per order
            if rounding_method == 'round_globally':
                for group_key, group_value in grouped_data.iteritems():
                    if group_key[0] == 'tax':
                        for line in group_value:
                            line['credit'] = cur.round(line['credit'])
                            line['debit'] = cur.round(line['debit'])

            # coupon counterpart
            if has_coupon:
                insert_data('coupon_counter_part', {
                    'name': _("Giftcard Trade Receivables"),  # order.name,
                    'account_id': order_account,
                    'credit': ((order.amount_total < 0) and cd_amt) or 0.0,
                    'debit': ((order.amount_total > 0) and cc_amt) or 0.0,
                    'partner_id': partner_id
                })

            # counterpart
            insert_data('counter_part', {
                'name': _("Trade Receivables"),  # order.name,
                'account_id': order_account,
                'credit': ((order.amount_total < 0) and -order.amount_total + cd_amt) or 0.0,
                'debit': ((order.amount_total > 0) and order.amount_total - cc_amt) or 0.0,
                'partner_id': partner_id
            })
            order.write({'state': 'done', 'account_move': move.id})

        all_lines, coupon_lines = [], []
        for group_key, group_data in grouped_data.iteritems():
            if 'coupon' in group_key[0]:
                for value in group_data:
                    coupon_lines.append((0, 0, value), )
                continue
            for value in group_data:
                all_lines.append((0, 0, value), )

        if coupon_move:
            coupon_move.sudo().write({'line_ids': coupon_lines})
            coupon_move.sudo().post()
        if move:  # In case no order was changed
            move.sudo().write({'line_ids': all_lines})
            move.sudo().post()
        return True
