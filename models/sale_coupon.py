# -*- coding: utf-8 -*-
# Part of Inceptus ERP Solutions Pvt.ltd.
# See LICENSE file for copyright and licensing details.

from odoo import models, fields, api, _
from odoo.exceptions import ValidationError
from datetime import datetime
from dateutil.relativedelta import relativedelta
from odoo.tools.misc import DEFAULT_SERVER_DATE_FORMAT as DF


class ProductTemplate(models.Model):
    _name = 'product.template'

    _inherit = ["product.template", "ies.base"]

    # @api.one
    @api.constrains('barcode')
    def check_barcode(self):
        coupon_barcode = self.env['product.coupon'].search([('name', '=', self.barcode)])
        barcode = self.search([('barcode', '=', self.barcode)])
        if len(coupon_barcode) or len(barcode):
            raise ValidationError(_('Barcode number should be unique.'))

    @api.constrains('discount_percentage')
    def check_discount_percentage(self):
        if self.discount_percentage > 100.0:
            raise ValidationError(_('Discount can not be greater then 100.'))

    # @api.one
    # @api.depends('coupon_ids')
    # def _get_giftcard_count(self):
    #     self.giftcard_count = len(self.coupon_ids.filtered(lambda record: record.type in ['f', 'd']))

    # @api.one
    # @api.depends('coupon_ids')
    # def _get_coupon_count(self):
    #     self.coupon_count = len(self.coupon_ids.filtered(lambda record: record.type in ['p']))

    @api.model
    def _get_discount_type(self):
        if self._context.get('giftcard'):
            return [('f', 'Fixed'), ('d', 'Dynamic Amount')]
        elif self._context.get('coupon'):
            return [('p', 'Percentage')]
        elif self._context.get('vouher'):
            return [('f', 'Fixed')]
        else:
            return [('f', 'Fixed')]

    @api.model
    def _get_default_type(self):
        if self._context.get('coupon'):
            return 'p'

    # @api.constrains('discount_type')
    # def _check_discount_type(self):
    #     for rec in self:
    #         if rec.promotional and rec.discount_type == 'd':
    #             raise ValidationError(_('Promotional Giftcard can not have type \"Dynamic Amount\".'))

    # @api.constrains('discount_amount', 'lst_price')
    # def _check_discount_amount(self):
    #     for rec in self:
    #         if rec.discount_type == 'f' and rec.discount_amount < rec.lst_price:
    #             raise ValidationError(_('Discount amount can not be less than sale price!'))

    @api.model
    def get_default_type(self):
        if self.env.context.get('default_is_coupon'):
            return 'service'

    @api.model
    def compute_expiry_date(self, expiry_unit, expiry_interval):
        from_date = datetime.today()
        if expiry_unit == 'days':
            date_after_month = from_date + relativedelta(days=expiry_interval)
        elif expiry_unit == 'weeks':
            date_after_month = from_date + relativedelta(weeks=expiry_interval)
        elif expiry_unit == 'months':
            date_after_month = from_date + relativedelta(months=expiry_interval)
        elif expiry_unit == 'years':
            date_after_month = from_date + relativedelta(years=expiry_interval)
        if date_after_month:
            return date_after_month.strftime(DF)

    # @api.multi
    @api.depends('expiry_interval', 'expiry_unit')
    def _get_expires_on(self):
        for rec in self:
            if rec.expiry_type == 'as' and rec.expiry_interval and rec.expiry_unit:
                rec.expires_on = self.compute_expiry_date(rec.expiry_unit, rec.expiry_interval)

    is_coupon = fields.Boolean('Is Giftcard?', readonly=1)
    #     qty = fields.Integer('Number of Coupons') #will be asked on wiz can remove
    discount_type = fields.Selection(_get_discount_type, string='Type', default=_get_default_type,
                                     help="Fixed- A Predefined credit amount and sale price will be assigned to the associated gift cards.\n\
        Dynamic - The credit amount will be defined from the pos in the moment of sale.(sale price will be the sale as credit amount)")
    discount_amount = fields.Float('Credit Amount', help="The issued credit amount to be in the generated Gift Cards")
    discount_percentage = fields.Float('Discount Percentage',
                                       help="The discount percentage to be on the generated Coupons")
    single_use = fields.Boolean('Single Use?', help="If checed, the Gift Card will be valid only for one use.")

    # expiry_after_sale = fields.Boolean('Expires After Sale?', help="Start Expiry of the Giftcard/Coupon After Sale?")
    # no longer using this field after intro of expiry type

    expiry_type = fields.Selection([
        ('as', 'After Date of Sale'),
        ('d', 'On Specific Date')
    ], 'Expiry Type', help="")

    expiry_interval = fields.Integer('Expires After')
    expiry_unit = fields.Selection([('days', "Days"), ('weeks', "Weeks"), ('months', "Months"), ('years', "Years")], )
    expires_on = fields.Date('Expiry Date', help="If defined, expiration date will be activated.",
                             compute="_get_expires_on", store=True)
    # giftcard_count = fields.Integer('Giftcard Count', compute="_get_giftcard_count")
    coupon_count = fields.Integer('Coupon Count', compute="_get_coupon_count")
    coupon_ids = fields.One2many('product.coupon', 'product_id', copy=False, ondelete='cascade')
    generated = fields.Boolean('Generated?')
    type = fields.Selection(default=get_default_type)
    is_voucher = fields.Boolean("Voucher?", help="If Voucher checked, Gift Card would be usable directly after generation "
                                     "(Gift Card will be issued directly to paid status, and therefore payment "
                                     "will not be required)")
    cart_limit = fields.Float('Min. Cart Limit', help='Minimum Cart Amount, 0.0 for no min. cart value')

    @api.onchange("expiry_type")
    def onchange_expiry_type(self):
        if self.expiry_interval:
            self.expiry_interval = False
        if self.expiry_unit:
            self.expiry_unit = False
        if self.expires_on:
            self.expires_on = False

    @api.onchange('discount_type')
    def onchange_type(self):
        self.discount_amount = 0.0
        self.discount_percentage = 0.0
        self.lst_price = 0.0

    # @api.onchange('discount_amount')
    # def onchange_discount_amount(self):
    #     if not self.promotional:
    #         self.write({'lst_price': self.discount_amount})

    # @api.multi
    # def open_giftcards(self):
    #     domain = [('product_id', '=', self.id)]
    #     view_id, form_view_id = False, False
    #     name = False
    #     if self._context.get('type') == 'gc':
    #         name = _('Giftcards')
    #         domain += [('type', 'in', ['f', 'd'])]
    #         view_id = self.env.ref('ies_base_redeem.ies_product_giftcard_tree').id
    #         form_view_id = self.env.ref('ies_base_redeem.ies_product_giftcard_form').id
    #     elif self._context.get('type') == 'p':
    #         name = _('Coupons')
    #         domain += [('type', '=', 'p')]
    #         view_id = self.env.ref('ies_base_redeem.ies_product_coupon_tree').id
    #
    #         form_view_id = self.env.ref('ies_base_redeem.ies_product_coupon_form').id
    #     return {
    #         'name': name,
    #         'type': 'ir.actions.act_window',
    #         'view_type': 'form',
    #         'view_mode': 'tree,form',
    #         'res_model': 'product.coupon',
    #         'domain': domain,
    #         'views': [(view_id, 'tree'), (form_view_id, 'form')]
    #     }

    @api.model
    def search(self, args, offset=0, limit=None, order=None, count=False):
        if not args:
            args = []
        if not self._context.get('default_is_coupon'):
            args.append(('is_coupon', '=', False))
        res = super(ProductTemplate, self).search(args, offset, limit, order, count)
        return res

    @api.model
    def default_get(self, fields):
        rec = super(ProductTemplate, self).default_get(fields)
        if rec.get('is_coupon') and self.env.ref('inceptus-base_redeem.product_uom_piece'):
            ref = self.env.ref('inceptus-base_redeem.product_uom_piece')
            rec.update({'uom_id': ref.id, 'uom_po_id': ref.id})
        if self._context.get('giftcard'):
            if rec.get('taxes_id'):
                rec.pop('taxes_id')
            if rec.get('supplier_taxes_id'):
                rec.pop('supplier_taxes_id')
        return rec

    # @api.multi
    def generate_coupon_wiz(self):
        name = "Generate"
        if self._context.get('giftcard'):
            name = "Generate Giftcards"
        elif self._context.get('coupon'):
            name = "Generate Coupons"
        return {
            'name': name,
            'type': 'ir.actions.act_window',
            'view_type': 'form',
            'view_mode': 'form',
            'res_model': 'generate.coupons',
            'target': 'new'
        }


class ProductCoupon(models.Model):
    _name = 'product.coupon'

    _inherit = ["ies.base"]

    # _order = 'create_date desc'
    _description = "Product Coupon"

    name = fields.Char('Name')
    product_id = fields.Many2one('product.template', "Template", help="The related template")
    rel_product_id = fields.Many2one('product.product', related="product_id.product_variant_id")

    type = fields.Selection([('f', 'Fixed'), ('d', 'Dynamic'), ('p', 'Percentage'), ], 'Type')

    amount = fields.Float('Credit Amount', help="The issued credit amount of this Gift Card")
    rem_amount = fields.Float('Remaining Amount', help="The remaining amount of credit in this Gift Card")
    sale_date = fields.Date('Sale Date', help="The sale date of this Gift Card")
    printed = fields.Boolean('Printed', help="Will be checked after Gift Card has been sent to print")
    expire_date = fields.Date('Expires on', help="The expiry date of this Gift Card")
    single_use = fields.Boolean('Single use?', help="If checed, the Gift Card will be valid only for one use")

    percentage = fields.Float('Discount %')
    sale_price = fields.Float('Sale Price')
    pos_order_id = fields.Many2one('pos.order', 'POS Order')
    state = fields.Selection([('o', 'Open'), ('s', 'Sold'),
                              ('pr', 'Partially Reedemed'), ('r', 'Reedemed'),
                              ('e', 'Expired')],
                             index=True, default="o", track_visibility='onchange')
    active = fields.Boolean('Active', default=True)
    reedem_ids = fields.One2many('coupon.reedem', 'coupon_id', 'Redeem History')
    partner_id = fields.Many2one('res.partner', 'Customer')

    coupon_type = fields.Selection([('gc', 'Gift Card'), ('c', 'Coupon'), ('v', 'Voucher'), ('cn', 'Credit Note')])
    cart_limit = fields.Float('Min. Cart Limit', help='Minimum Cart Amount, 0.0 for no min. cart value')
    # invoice_id = fields.Many2one('account.invoice', "Related Invoice")
    invoice_id = fields.Many2one('account.move', "Related Invoice")

    # is_voucher = fields.Boolean('Is Voucher?')
    # is_credit_note = fields.Boolean('Is Credit Note?')

    # @api.multi
    def unlink(self):
        for rec in self:
            if rec.state not in ['o']:
                raise ValidationError(_('Giftcards can only be deleted in Open Stage.'))
        return super(ProductCoupon, self).unlink()


class CouponReedem(models.Model):
    _name = 'coupon.reedem'

    _inherit = ["ies.base"]
    _description = "Coupon Reedem"

    name = fields.Char('Name')
    coupon_id = fields.Many2one('product.coupon', 'Coupon')
    date = fields.Date('Date')
    order_id = fields.Many2one('pos.order', "Order")
    amount = fields.Float('Amount')
    shop_id = fields.Many2one('res.company', 'Shop')
