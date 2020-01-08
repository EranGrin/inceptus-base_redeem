# -*- coding: utf-8 -*-
# Part of Inceptus ERP Solutions Pvt.ltd.
# See LICENSE file for copyright and licensing details.

from odoo import models, fields, api, _
import csv
import tempfile
import base64


class ExportCSV(models.TransientModel):
    _name = 'export.csv'
    _description = "CSV Export"

    datas = fields.Binary('CSV file')
    file_name = fields.Char("File Name", default="DataExport.csv")
    export = fields.Boolean()

    # @api.multi
    def export_data(self):
        tmp_dir = tempfile.mkdtemp()
        export_file = tmp_dir + '/csv_data.csv'
        csv_file = open(export_file, "wb")
        writer = csv.writer(csv_file)
        for rec in self.env[self._context.get('active_model')].browse(self._context.get('active_ids')):
            writer.writerow(
                [rec.id, rec.name, rec.amount, rec.expire_date, rec.sale_date, rec.sale_price, rec.state, rec.type])
        csv_file.close()

        fn = open(export_file, 'rb')
        file_data = base64.encodestring(fn.read())
        fn.close()

        self.datas = file_data
        self.export = True

        return {
            'name': _('CSV Exported!'),
            'view_type': 'form',
            'view_mode': 'form',
            'res_model': 'export.csv',
            'type': 'ir.actions.act_window',
            'res_id': self.id,
            'target': 'new'
        }
