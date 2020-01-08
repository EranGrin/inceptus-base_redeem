odoo.define('inceptus-base_redeem.DB', function (require) {
    "use strict";

    var PosDB = require('point_of_sale.DB');

    PosDB.include({
    	init: function(options){
    		this.coupon_by_name = {}
    		this._super(options);
    	},
    	add_coupons:function(coupons){
    		if(!coupons instanceof Array){
    			coupons = [coupons];
            }
    		for(var i = 0, len = coupons.length; i < len; i++){
    			var coupon = coupons[i];
    			this.coupon_by_name[coupon.name] = coupon;
    		}
    	}, 
    	
    	get_coupon_info: function(query){
    		var self = this;
    		if (self.coupon_by_name[query] !== undefined){
    			var coupon = self.coupon_by_name[query];
    			return coupon;
    		}else{
    			return false;
    		}
    	},
    	
    	get_coupon_products : function(query){
    		var self = this;
    		var results = [];
    		if (self.coupon_by_name[query] !== undefined){
    			var coupon = self.coupon_by_name[query];
    			var id = coupon['rel_product_id'][0];
    			var product = this.get_product_by_id(id);
    			product['search_gc'] = coupon;
    			results.push(product);
    		} 
    		return results;
    	},
    });
    return PosDB;
    
})