# -*- coding: utf-8 -*-
# Part of Inceptus ERP Solutions Pvt.ltd.
# See LICENSE file for copyright and licensing details.

from odoo import models, fields, api, _
from odoo.exceptions import ValidationError
from random import randrange


class ProductTemplate(models.TransientModel):
    _name = 'generate.coupons'
    _description = "Coupons Generate"

    coupon_qty = fields.Integer('Number of Coupons', default=1)
    customer = fields.Boolean('Assign to customer?', help="if assigned to customer, generated coupon will be automatically sold.")
    partner_id = fields.Many2one('res.partner', 'Customer')

    @api.model
    def generate_coupon_number(self, digits):
        ean = map(int, list(digits))
        for x in range(10):
            ean.append(randrange(10))
        sum = lambda x, y: int(x) + int(y)
        evensum = reduce(sum, ean[::2])
        oddsum = reduce(sum, ean[1::2])
        ean.append((10 - ((evensum + oddsum * 3) % 10)) % 10)
        number = ''.join(map(str, ean))
        coupon_barcode = self.env['product.coupon'].search([('name', '=', number)])
        barcode = self.env['product.template'].search([('barcode', '=', number)])
        if len(coupon_barcode) or len(barcode):
            self.generate_coupon_number(digits)
        return number

    @api.model
    def get_barcode_number(self):
        user = self.env['res.users'].browse(self._uid)
        if not user.company_id.code_format:
            raise ValidationError(_('Please Configure Giftcard Code Format in Company.'))
        if user.company_id.code_format == 'ean13':
            return self.generate_coupon_number('99')
        elif user.company_id.code_format == 'upca':
            return self.generate_coupon_number('5')

    # @api.multi
    def generate_coupons(self):
        coupon_env = self.env['product.coupon']
        product_id = self.env['product.template'].browse(self._context.get('active_id'))
        created_coupons = []
        for qty in range(self.coupon_qty):
            vals = {
                'name': self.get_barcode_number(),
                'amount': product_id.discount_amount,
                'rem_amount': product_id.discount_amount,
                'percentage': product_id.discount_percentage,
                'single_use': product_id.single_use,
                'expire_date': product_id.expires_on,
                'product_id': product_id.id,
                'type': product_id.discount_type,
                'sale_price': product_id.lst_price,
                'partner_id': 1,
                'cart_limit': product_id.cart_limit,
                'partner_id': self.partner_id and self.partner_id.id or False,
            }
            if product_id.discount_type in ['f', 'd']:
                vals.update(coupon_type='gc')
            else:
                vals.update(coupon_type='c')
            coupon = coupon_env.create(vals)
            created_coupons.append((4, coupon.id))
        if self.customer:
            # for customer it will create invoice with coupons in it.
            # once the invoice is paid, coupon state will be set to sold
            invoice_env = self.env['account.invoice']
            inv_vals = invoice_env.default_get(['journal_id'])
            journal_id = self.env['account.journal'].browse(inv_vals.get('journal_id'))
            inv_vals.update({
                'partner_id': self.partner_id.id,
                'coupon_ids': created_coupons,
                'date_invoice': fields.Date.today(),
                'invoice_line_ids': [(0,0, {'product_id': product_id.id, 'name': product_id.name,
                                            'quantity': self.coupon_qty, 'price_unit': product_id.lst_price,
                                            'account_id': journal_id.default_debit_account_id.id,})]
            })
            invoice = invoice_env.create(inv_vals)

            tree_view_id = self.env.ref('account.invoice_tree').id
            form_view_id = self.env.ref('account.invoice_form').id

            return {
                'name': "Invoice to pay",
                'type': 'ir.actions.act_window',
                'view_type': 'form',
                'view_mode': 'tree,form',
                'res_model': 'account.invoice',
                'domain': [('id', 'in', [invoice.id])],
                'views': [(tree_view_id, 'tree'), (form_view_id, 'form')]
            }

        product_id.generated = True
        return {'type': 'ir.actions.act_window_close'}
