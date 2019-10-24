# -*- coding: utf-8 -*-
# Part of Inceptus ERP Solutions Pvt.ltd.
# See LICENSE file for copyright and licensing details.
{
    'name': "POS Base Reedem",
    'summary': """
        Base Module for POS Reedem""",
    'description': """
        Base Module for POS Reedem
    """,
    'author': "Inceptus.io",
    'website': "http://www.inceptus.io",

    'category': 'Sale',
    'version': '1.0',
    'depends': ['sale', 'point_of_sale', 'ies_base'],
    'data': [
        'security/ir.model.access.csv',
        'data/pos_data.xml',
        'wizard/generate_coupons_view.xml',
        'wizard/print_giftcard_view.xml',
        'wizard/export_csv_view.xml',
        'views/company_view.xml',
        'views/template.xml',
        'views/sale_coupon_view.xml',
        'views/pos_view.xml',
        'views/report_invoice.xml',
        'views/partner_view.xml',
    ],
    
    'qweb': ['static/src/xml/*.xml'],

    'installable': True,
    'auto_install': False,
    'application': False,
}