# -*- coding: utf-8 -*-
# Part of Inceptus ERP Solutions Pvt.ltd.
# See LICENSE file for copyright and licensing details.

from odoo import models, fields, api, _, SUPERUSER_ID
from odoo.exceptions import UserError
from odoo.tools import DEFAULT_SERVER_DATETIME_FORMAT
import time


class Company(models.Model):

    _inherit = 'res.company'

    code_format = fields.Selection([('ean13', 'EAN-13'), ('upca', 'UPC-A')], 'Giftcard Code Format', default="ean13")
