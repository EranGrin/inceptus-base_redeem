# -*- coding: utf-8 -*-
# Part of Inceptus ERP Solutions Pvt.ltd.
# See LICENSE file for copyright and licensing details.

from odoo import models, fields, api, _


class ProductTemplate(models.TransientModel):
    _name = 'print.giftcards'

    printer = fields.Selection([('A','Printer A'), ('B','Printer B')], "Printer")

    @api.multi
    def print_giftcards(self):
        pass
