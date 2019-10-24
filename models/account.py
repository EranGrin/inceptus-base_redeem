# -*- coding: utf-8 -*-
# Part of Inceptus ERP Solutions Pvt.ltd.
# See LICENSE file for copyright and licensing details.

from odoo import api, fields, models, _


class AccountInvoice(models.Model):
    _inherit = 'account.invoice'

    coupon_ids = fields.One2many('product.coupon', 'invoice_id', "Vouchers")

    @api.multi
    def write(self, vals):
        res = super(AccountInvoice, self).write(vals)
        if vals.get('state') == 'paid':
            for rec in self:
                expiry_date = False
                if rec.coupon_ids and rec.coupon_ids[0] and rec.coupon_ids[0].product_id.expiry_type == 'as':
                    product_id = rec.vocher_ids[0].product_id
                    expiry_date = self.env['product.template'].compute_expiry_date(product_id.expiry_unit,
                                                                                   product_id.expiry_interval)
                rec.coupon_ids.write({
                    'state': 's',
                    'sale_date': fields.Date.today(),
                    'expire_date': expiry_date or False
                })
        return res


class AccountJournal(models.Model):
    _inherit = 'account.journal'

    coupon = fields.Boolean('GiftCard?')


class AccountMove(models.Model):
    _inherit = "account.move"

    is_coupon = fields.Boolean('Is Coupon')
    parent_id = fields.Many2one('account.move', 'Parent Move')
    reedem_move_ids = fields.One2many('account.move', 'parent_id', 'Reedem Moves')


class AccountBankStatementLine(models.Model):
    _inherit = 'account.bank.statement.line'

    coupon_id = fields.Many2one("product.coupon", "Related Giftcard")

class AccountInvoiceLine(models.Model):
    _inherit = "account.invoice.line"

    coupon_id = fields.Many2one("product.coupon", "Related Giftcard")
