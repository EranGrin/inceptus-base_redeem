odoo.define('inceptus-base_redeem.inceptus-base_redeem', function (require) {
	"use strict";
	var core = require('web.core');
	var QWeb = core.qweb;
    var gui = require('point_of_sale.gui');
	var models = require('point_of_sale.models');
	var Model = require('web.DataModel');
	var screens = require('point_of_sale.screens');
	var PosDB = require('point_of_sale.DB');
	var PopupWidget = require('point_of_sale.popups');
	var PosBaseWidget = require('point_of_sale.BaseWidget');
	var _t   = core._t;

	var utils = require('web.utils');
	var round_pr = utils.round_precision;

	var PosModelSuper = models.PosModel;

	var POSGiftcardAdd = PopupWidget.extend({
    	template: 'GiftcardAdd',

    	barcode_product_action: function(code){
            var self = this;
            this.$('input,textarea').val(code.base_code);
        },

    	card_reader_action: function(parsedCode){
            var self = this;
            var decodedMagtek = self.pos.decodeMagtek(parsedCode.code);
            if (decodedMagtek && decodedMagtek.number){
                var code = decodedMagtek.number.replace(/\D/g,'');
                this.$('input,textarea').val(code);
            }
        },

    	show: function(options){
    	    var self = this;
            options = options || {};
            this._super(options);
            this.renderElement();
            this.$('input,textarea').focus().val($('.searchbox>input').val());

            this.$('input,textarea').focus().blur(function() {
            	$('#ga_msg').empty();
            	if ($(this).val()){
            		self.check_valid($(this).val());
            	}
        	});

        	this.pos.barcode_reader.set_action_callback({
                'product': _.bind(self.barcode_product_action, self),
                'weight': _.bind(self.barcode_product_action, self),
                'price': _.bind(self.barcode_product_action, self),
                'credit': _.bind(self.card_reader_action, self),
            });

        },
        append_msg: function(top_msg, clear){
        	$('#ga_msg').append(_t(top_msg));
        	if (clear){
        		$('#giftcard_input').val('');
        	}
        },
        check_valid: function(vals){
            var self = this;
            var coupon = this.pos.db.get_coupon_info(vals);
            if (coupon){
                self.append_msg("<p>Giftcard is valid!</p>", false);
            }
            else{
                self.append_msg("<p>Giftcard does not exist!</p>", true);
            }
        },
        click_confirm: function(){
            var value = this.$('input,textarea').val();
            this.gui.close_popup();
            if( this.options.confirm ){
                this.options.confirm.call(this,value);
            }
        },
    });

    gui.define_popup({name:'GiftcardAdd', widget: POSGiftcardAdd});

    var POSDynamicGiftcardAmount = PopupWidget.extend({
    	template: 'DynamicGiftcard',
    	show: function(options){
            options = options || {};
            this._super(options);
            this.renderElement();
            this.$('input,textarea').focus();

            this.$('input,textarea').keyup(function () {
                this.value = this.value.replace(/[^0-9\.]/g, '')
            });

        },
        click_confirm: function(){
            var value = this.$('input,textarea').val();
            this.gui.close_popup();
            if( this.options.confirm ){
                this.options.confirm.call(this,value);
            }
        },
    });
    gui.define_popup({name:'DynamicGiftcard', widget: POSDynamicGiftcardAmount});


	models.PosModel = models.PosModel.extend({

        decodeMagtek: function (magtekInput) {
            // Regular expression to identify and extract data from the track 1 & 2 of the magnetic code
            var _track1_regex = /%B?([0-9]*)\^([A-Z\/ -_]*)\^([0-9]{4})(.{3})([^?]+)\?/;

            var track1 = magtekInput.match(_track1_regex);
            var magtek_generated = magtekInput.split('|');

            var to_return = {};
            try {
                track1.shift(); // get rid of complete match
                to_return['number'] = track1.shift().substr(-4);
                to_return['name'] = track1.shift();
                track1.shift(); // expiration date
                track1.shift(); // service code
                track1.shift(); // discretionary data
                track1.shift(); // zero pad

                magtek_generated.shift(); // track1 and track2
                magtek_generated.shift(); // clear text crc
                magtek_generated.shift(); // encryption counter
                to_return['encrypted_block'] = magtek_generated.shift();
                magtek_generated.shift(); // enc session id
                magtek_generated.shift(); // device serial
                magtek_generated.shift(); // magneprint data
                magtek_generated.shift(); // magneprint status
                magtek_generated.shift(); // enc track3
                to_return['encrypted_key'] = magtek_generated.shift();
                magtek_generated.shift(); // enc track1
                magtek_generated.shift(); // reader enc status

                return to_return;
            } catch (e) {
                return 0;
            }
        },
		add_coupon_product: function(coupon, amount=false){
		    var discount;
			var selectedOrder = this.get_order();
			if (coupon.state === 's'){
			    this.gui.show_popup('error',_t('Already Sold Or Not Available.'));
				return;
			}
			var error = _.filter(selectedOrder.get_orderlines(), function(line){
				if (line.coupon !== undefined){
					return line.coupon.name == coupon.name; 
				}
			})
			if (error.length > 0){
				this.gui.show_popup('error',{
                    title: _t('Giftcard already added!'),
                    body:  _t('Giftcard can only be added once.'),
                });
				return;
			}
			var product = this.db.get_product_by_id(coupon.rel_product_id[0]);
			var amount = amount || coupon.amount || coupon.sale_price;
            if (coupon.amount - product.list_price > 0){
                discount = coupon.amount - product.list_price;
            }

			selectedOrder.add_product(product, {'nopop':1, price: amount, discount: discount});
			var line = selectedOrder.get_selected_orderline();
			line.set_coupon(coupon);
			if (discount){
				line.is_discounted = true;
			}
			var $numpad =  $('div.numpad');
			if (coupon.type === 'd' || coupon.type === 'p'){
			    $numpad.find('[data-mode="price"]').attr("disabled",true);
			}
			this.gui.current_screen.order_widget.numpad_state.changeMode('');
			$numpad.find('[data-mode="quantity"]').attr("disabled",true);
            $numpad.find('[data-mode="discount"]').attr("disabled",true);
            $numpad.find('.numpad-minus').attr("disabled",true);
		},

		ask_amount: function(coupon){
			var self = this;
            this.gui.show_popup('DynamicGiftcard',{
                title: _t('Enter Giftcard Amount'),
                confirm: function(amount){
                	coupon.rem_amount = amount;
                	self.add_coupon_product(coupon, amount);
					// self.gui.close_popup();
                }
            });
		},
		
		check_coupon: function(parsed_code){
			var self = this;
			if (this.config.coupon_mode ==='off'){
				var coupon = this.db.get_coupon_info(parsed_code);

				if (!coupon){
					return false;
				}

				if (coupon.coupon_type === 'v' ){return false}
				if (coupon.type === 'd'){
				    if (coupon.state == 's'){
                        return this.gui.show_popup('error',_t('Giftcard can not be sold more then once.'));
                    }
				    self.ask_amount(coupon);
				}
				else{
					self.add_coupon_product(coupon);
				    return true;
				}
			}
			else{
				var CouponModel = new Model('product.coupon');
    			var domain = [['name', 'ilike', parsed_code]];
    			CouponModel.call('search_read', [domain, ['name', 'product_id', 'rel_product_id', 'amount', 'rem_amount',
           	     'percentage', 'expire_date', 'state', 'type', 'single_use', 'sale_price','coupon_type', 'partner_id']]).then(function (result) {
     				if (result && result.length == 1) {
     					var coupon = result[0];
     					if (!coupon){
    						return false;
    					}
    					if (coupon.coupon_type === 'v'){return false}
     					if (coupon.type === 'd'){
     					    if (coupon.state == 's'){
                                return this.gui.show_popup('error',_t('Giftcard can not be sold more then once.'));
                            }
     						self.ask_amount(coupon);
     					}
     					else{
     						self.add_coupon_product(coupon);
        					return true;
     					}
     				}
           	     });
			}
		},

		scan_product: function(parsed_code){
			var self = this;
			if (parsed_code.type === 'product'){
				var is_coupon = self.check_coupon(parsed_code.base_code);
				if (!is_coupon){
					PosModelSuper.prototype.scan_product.call(this, parsed_code);
				}
			}
			else{
				return PosModelSuper.prototype.scan_product.call(this, parsed_code);
			}
		}
	})

	models.load_models({
        model:  'product.coupon',
        fields: ['name', 'product_id', 'rel_product_id', 'amount', 'rem_amount',
        	     'percentage', 'expire_date', 'state', 'type', 'single_use','coupon_type', 'cart_limit', 'partner_id'],
        order:  ['id'],
        domain: [],
        loaded: function(self, coupons){
            self.db.add_coupons(coupons);
        }
    });

	models.load_fields("account.journal",['coupon']);
	models.load_fields("product.product",['is_coupon', 'coupon_ids', 'cart_limit']);

    var _super_posmodel = models.PosModel.prototype;
    models.PosModel = models.PosModel.extend({
        _save_to_server: function (orders, options) {
            var self = this;
            _.each(orders, function(o){
                _.each(o.data.lines, function(l){
                    if (l && l[2] && l[2].coupon && l[2].qty < 0){
                        var db_coupon = self.db.get_coupon_info(l[2].coupon.name);
                        l[2].coupon.rem_amount -= l[2].price_unit;
                        db_coupon.rem_amount = l[2].coupon.rem_amount;
                        if (l[2].coupon.rem_amount > 0){
                            db_coupon.state = 'pr';
                        }else{
                            db_coupon.state = 'r';
                        }
                    }
                    else if (l && l[2] && l[2].coupon && l[2].qty > 0 && l[2].coupon){
                        var db_coupon = self.db.get_coupon_info(l[2].coupon.name);
                        if (l[2].coupon.type==='d'){
                            var db_coupon = self.db.get_coupon_info(l[2].coupon.name);
                            db_coupon.rem_amount = l[2].price_unit;
                        }
                        db_coupon.state = 's';
                    }
                });
            });
            arguments[0] = orders;
            return _super_posmodel._save_to_server.apply(this, arguments);
        },
    });
	
    var GiftcardPopup = PopupWidget.extend({
        // Handles the Reedem code popup!
    	template: 'POSCouponLoad',

    	barcode_product_action: function(code){
            var self = this;
            this.$('input,textarea').val(code.base_code);
            self.coupon_render(code.base_code);
        },

        card_reader_action: function(parsedCode){
            var self = this;
            var decodedMagtek = self.pos.decodeMagtek(parsedCode.code);
            if (decodedMagtek && decodedMagtek.number){
                this.$('input,textarea').val(decodedMagtek.number);
                self.coupon_render(decodedMagtek.number);
            }
        },

    	show: function(options){
    		var self = this;
            options = options || {};
            this._super(options);
            this.renderElement();
            this.$('input,textarea').focus().blur(function() {
            	$('#msg').empty();
            	$('#msgtxt').empty();
            	if ($(this).val()){
            		self.coupon_render($(this).val());
            	}
        	});
        	this.pos.barcode_reader.set_action_callback({
                'product': _.bind(self.barcode_product_action, self),
                'weight': _.bind(self.barcode_product_action, self),
                'price': _.bind(self.barcode_product_action, self),
                'credit': _.bind(self.card_reader_action, self),
            });
        },

        append_msg: function(top_msg, clear){
        	$('#msg').append(_t(top_msg));
        	if (clear){
        		$('#giftcard_input').val('');
        	}
        },
		disable_confirm: function(disabled){
        	if (disabled){
        		$('.confirm').addClass('disabled');
			}
			else{
        		$('.confirm').removeClass('disabled');
			}

		},

        is_giftcard_exist: function(name){
        	var self = this;
        	var order = this.pos.get_order();
			var error = _.filter(order.get_orderlines(), function(line){
				if (line.coupon !== undefined){
					return line.coupon.name == name;
				}
			})
			if (error.length > 0){
				return true
			}
			return false;
		},

        coupon_render: function(vals){
        	var self = this;
        	if (this.is_giftcard_exist(vals)){
        		this.append_msg("<p>Redeem Code already entered!</p>", true);
                return;
            }

    		if (this.pos.config.coupon_mode ==='off'){
    			var coupon = this.pos.db.get_coupon_info(vals);
    			///////////////////////////////////////////////////////////
    			if (coupon){
    				self.disable_confirm(true);
        			if (coupon.expire_date && new Date() > new Date(coupon.expire_date)){
            			coupon.state = 'e'
            		}
            		if(coupon.state === 's' || coupon.state === 'pr' && !coupon.single_use){
            			self.append_msg("<p>Redeem Code is valid!</p>", false);
            			self.disable_confirm(false);
            			if(coupon.type === 'f' || coupon.type === 'd'){
    	        			$('#msgtxt').append(_t("<p>Total Balance : "+ self.format_currency(coupon.amount) +"</p>"+
    	        					"<p>Available Balance : "+ self.format_currency(coupon.rem_amount) + "</p>"));
    	        			if (coupon.expire_date){
								$('#msgtxt').append(_t("<p>Expiry Date : "+ coupon.expire_date + "</p>"));
							}
						}else if(coupon.type === 'p'){
            				$('#msgtxt').append(_t("<p>Discount Available : "+ coupon.percentage+"% </p>"));
            				if (coupon.expire_date){
								$('#msgtxt').append(_t("<p>Expiry Date : "+ coupon.expire_date + "</p>"));
							}
            			}
            		}else if(coupon.state === 'r'){
            			self.append_msg("<p>Redeem Code already reedemed!</p>", true);
            		}else if(coupon.state === 'e'){
            			self.append_msg("<p>Redeem Code will expired on " + coupon.expire_date + ".</p>", true);
            		}else if (coupon.state === 'pr' && coupon.single_use){
						self.append_msg("<p>Redeem Code can not be reedem more than one time.</p>", true);
					}
            		else{
            			self.append_msg("<p>Redeem Code is not available!</p>", true);
            		}
        		}
    			else{
    				self.append_msg("<p>Redeem Code does not exist!</p>", true);
        		}
    			//////////////////////////////////////////////////////////
    		}
    		else if (this.pos.config.coupon_mode ==='on'){
    			var CouponModel = new Model('product.coupon');
    			var domain = [['name', 'ilike', vals]];
    			CouponModel.call('search_read', [domain, ['name', 'product_id', 'rel_product_id', 'amount', 'rem_amount',
           	     'percentage', 'expire_date', 'state', 'type', 'single_use', 'coupon_type', 'cart_limit', 'partner_id']]).then(function (result) {
    				if (result && result.length == 1) {
    					var coupon = result[0];
    					//////////////////////////////////////////////////////
    					if (coupon){
    						self.disable_confirm(true);
    	        			if (coupon.expire_date && new Date() > new Date(coupon.expire_date)){
    	            			coupon.state = 'e'
    	            		}
    	            		if(coupon.state === 's' || coupon.state === 'pr' && !coupon.single_use){
    	            			self.append_msg("<p>Redeem Code is valid!</p>", false);
    	            			self.disable_confirm(false);
    	            			if(coupon.type === 'f' || coupon.type === 'd'){
									$('#msgtxt').append(_t("<p>Total Balance : "+ self.format_currency(coupon.amount) +"</p>"+
											"<p>Available Balance : "+ self.format_currency(coupon.rem_amount) + "</p>"));
									if (coupon.expire_date){
										$('#msgtxt').append(_t("<p>Expiry Date : "+ coupon.expire_date + "</p>"));
									}
								}else if(coupon.type === 'p'){
									$('#msgtxt').append(_t("<p>Discount Available : "+ coupon.percentage+"% </p>"));
									if (coupon.expire_date){
										$('#msgtxt').append(_t("<p>Expiry Date : "+ coupon.expire_date + "</p>"));
									}
								}
    	            		}else if(coupon.state === 'r'){
    	            			self.append_msg("<p>Redeem Code already reedemed!</p>", true);
    	            		}else if(coupon.state === 'e'){
    	            			self.append_msg("<p>Redeem Code will expired on " + coupon.expire_date + ".</p>", true);
    	            		}else if (coupon.state === 'pr' && coupon.single_use){
								self.append_msg("<p>Redeem Code can not be reedem more than one time.</p>", true);
							}
    	            		else{
    	            			self.append_msg("<p>Redeem Code is not available!</p>", true);
    	            		}
    	        		}
    	    			else{
    	    				self.append_msg("<p>Redeem Code does not exist!</p>", true);
    	        		}
    					//////////////////////////////////////////////////////////
    				}
    			});
    		}
    		else{
    		    // Checks first online if coupon not found then checks online
    		    var CouponModel = new Model('product.coupon');
    			var domain = [['name', 'ilike', vals]];
    			var coupon = this.pos.db.get_coupon_info(vals);
    			if (coupon){
    				self.disable_confirm(true);
        			if (coupon.expire_date && new Date() > new Date(coupon.expire_date)){
            			coupon.state = 'e'
            		}
            		if(coupon.state === 's' || coupon.state === 'pr' && !coupon.single_use){
            			self.append_msg("<p>Redeem Code is valid!</p>", false);
            			self.disable_confirm(false);
            			if(coupon.type === 'f' || coupon.type === 'd'){
    	        			$('#msgtxt').append(_t("<p>Total Balance : "+ self.format_currency(coupon.amount) +"</p>"+
    	        					"<p>Available Balance : "+ self.format_currency(coupon.rem_amount) + "</p>"));
    	        			if (coupon.expire_date){
								$('#msgtxt').append(_t("<p>Expiry Date : "+ coupon.expire_date + "</p>"));
							}
						}else if(coupon.type === 'p'){
            				$('#msgtxt').append(_t("<p>Discount Available : "+ coupon.percentage+"% </p>"));
            				if (coupon.expire_date){
								$('#msgtxt').append(_t("<p>Expiry Date : "+ coupon.expire_date + "</p>"));
							}
            			}
            		}else if(coupon.state === 'r'){
            			self.append_msg("<p>Redeem Code already reedemed!</p>", true);
            		}else if(coupon.state === 'e'){
            			self.append_msg("<p>Redeem Code will expired on " + coupon.expire_date + ".</p>", true);
            		}else if (coupon.state === 'pr' && coupon.single_use){
						self.append_msg("<p>Redeem Code can not be reedem more than one time.</p>", true);
					}
            		else{
            			self.append_msg("<p>Giftcard is not available!</p>", true);
            		}
        		}
        		else{
        		    CouponModel.call('search_read', [domain, ['name', 'product_id', 'rel_product_id', 'amount', 'rem_amount',
           	        'percentage', 'expire_date', 'state', 'type', 'single_use', 'coupon_type', 'cart_limit', 'partner_id']]).then(function (result) {
    				if (result && result.length == 1) {
    					var coupon = result[0];
    					//////////////////////////////////////////////////////
    					if (coupon){
    						self.disable_confirm(true);
    	        			if (coupon.expire_date && new Date() > new Date(coupon.expire_date)){
    	            			coupon.state = 'e'
    	            		}
    	            		if(coupon.state === 's' || coupon.state === 'pr' && !coupon.single_use){
    	            			self.append_msg("<p>Redeem Code is valid!</p>", false);
    	            			self.disable_confirm(false);
    	            			if(coupon.type === 'f' || coupon.type === 'd'){
									$('#msgtxt').append(_t("<p>Total Balance : "+ self.format_currency(coupon.amount) +"</p>"+
											"<p>Available Balance : "+ self.format_currency(coupon.rem_amount) + "</p>"));
									if (coupon.expire_date){
										$('#msgtxt').append(_t("<p>Expiry Date : "+ coupon.expire_date + "</p>"));
									}
								}else if(coupon.type === 'p'){
									$('#msgtxt').append(_t("<p>Discount Available : "+ coupon.percentage+"% </p>"));
									if (coupon.expire_date){
										$('#msgtxt').append(_t("<p>Expiry Date : "+ coupon.expire_date + "</p>"));
									}
								}
    	            		}else if(coupon.state === 'r'){
    	            			self.append_msg("<p>Redeem Code already reedemed!</p>", true);
    	            		}else if(coupon.state === 'e'){
    	            			self.append_msg("<p>Redeem Code is expired on " + coupon.expire_date + ".</p>", true);
    	            		}else if (coupon.state === 'pr' && coupon.single_use){
								self.append_msg("<p>Redeem Code can not be reedem more than one time.</p>", true);
							}
    	            		else{
    	            			self.append_msg("<p>Redeem Code is not available!</p>", true);
    	            		}
    	        		}
    	    			else{
    	    				self.append_msg("<p>Redeem Code does not exist!</p>", true);
    	        		}
    					//////////////////////////////////////////////////////////
    				    }
    			    });
        		}
    		}
        },

		reedem_check:function(name){
			var self = this;
        	var order = this.pos.get_order();
        	var error = _.filter(order.get_orderlines(), function(line){
				if(!self.pos.config.allow_coupon_reedem && line.quantity > 0 && line.product.is_coupon){
					return line.coupon.name;
				}
			})
			if (error.length > 0){
				return true
			}
			return false;
		},

        click_confirm: function(){

        	var self = this;
            var value = this.$('input,textarea').val();
            if (this.is_giftcard_exist(value)){
            	this.gui.show_popup('error',{
                    'title': _t('Giftcard already reedemed'),
                    'body': _t('You can not enter a same coupon multiple time.'),
                });
                return;
            }

            var selectedOrder = this.pos.get_order();
            var coupon = this.pos.db.get_coupon_info(value);
            var coupon_register = _.find(this.pos.cashregisters, function (c) { return c.journal.coupon; })
            if (coupon_register){
            	coupon['statement_id'] = coupon_register;
            }
            if (coupon.cart_limit != 0.0 && coupon.cart_limit > selectedOrder.get_total_with_tax()){
                this.gui.show_popup('error',{
                    'title': _t('No Min. Cart value'),
                    'body': _t('To apply voucher cart value must be > ' + coupon.cart_limit +'.'),
                });
                return;
            }

            if (coupon.partner_id && coupon.partner_id[0] && !selectedOrder.attributes.client){
                this.gui.show_popup('error',{
                    'title': _t('No Customer Selected'),
                    'body': _t('Please Select the Customer.'),
                });
                return;
            }
            if (coupon.partner_id && coupon.partner_id[0] && selectedOrder.attributes.client.id !== coupon.partner_id[0]){
                this.gui.show_popup('error',{
                    'title': _t('Customer does not match'),
                    'body': _t('Redeem code is assigned to '+ coupon.partner_id[1]),
                });
                return;
            }

            var $numpad =  $('div.numpad');
            if(coupon.state === 'o' || coupon.state === 's' || coupon.state === 'pr'){
            	var coupon_product = this.pos.db.get_product_by_id(coupon.rel_product_id[0]);
            	if(coupon.type === 'f' || coupon.type === 'd'){
	            	var reedem_amt = coupon.rem_amount;
	            	if (selectedOrder.get_total_with_tax() < coupon.rem_amount){
	            		reedem_amt = selectedOrder.get_total_with_tax();
	            	}
	            	selectedOrder.add_product(coupon_product, {quantity: -1, price: reedem_amt});
	            	var line = this.pos.get_order().get_selected_orderline();
	            	line.set_coupon(coupon);
	            	coupon.state = coupon.state+'_x';
	            	this.gui.current_screen.order_widget.numpad_state.changeMode('price');
            	}
            	else if(coupon.type === 'p'){
            		_.each(selectedOrder.orderlines.models, function (line, index){
            			if (line.get_coupon() && (!self.pos.config.allow_coupon_reedem || line.is_discounted)){
						}
						else{
            				line.set_percentage = true;
            				line.set_discount(coupon.percentage);
						}
                    });
            		$numpad.find('[data-mode="price"]').attr("disabled",true);
            	}
            	$numpad.find('[data-mode="quantity"]').attr("disabled",true);
            	$numpad.find('[data-mode="discount"]').attr("disabled",true);
            	$numpad.find('.numpad-minus').attr("disabled",true);

            }
            this.gui.close_popup();
        },
    });
    gui.define_popup({name:'giftcard_pop', widget: GiftcardPopup});
    
    
    screens.ScreenWidget.include({
    	barcode_product_action: function(code){
    		// removed if condition
    		var self = this;
            if (self.pos.scan_product(code)) {
                if (self.barcode_product_screen) {
                    self.gui.show_screen(self.barcode_product_screen, null, null, true);
                }
            }
    	},
        card_reader_action: function(parsedCode){
            var self = this;
            var decodedMagtek = self.pos.decodeMagtek(parsedCode.code);
            if (decodedMagtek && decodedMagtek.number){
                var code = decodedMagtek.number.replace(/\D/g,'');
                var code_obj = {encoding: "any", type: "product", code: code, base_code: code, value: 0}
                if (self.pos.scan_product(code_obj)) {
                    if (self.barcode_product_screen) {
                        self.gui.show_screen(self.barcode_product_screen, null, null, true);
                    }
                }
            }
        },

    	show: function(){
            var self = this;

            this.hidden = false;
            if(this.$el){
                this.$el.removeClass('oe_hidden');
            }

            this.pos.barcode_reader.set_action_callback({
                'cashier': _.bind(self.barcode_cashier_action, self),
                'product': _.bind(self.barcode_product_action, self),
                'weight': _.bind(self.barcode_product_action, self),
                'price': _.bind(self.barcode_product_action, self),
                'client' : _.bind(self.barcode_client_action, self),
                'discount': _.bind(self.barcode_discount_action, self),
                'error'   : _.bind(self.barcode_error_action, self),
                'credit': _.bind(self.card_reader_action, self),
            });
        },
    })
    
    
	screens.ProductCategoriesWidget.include({
		perform_search: function(category, query, buy_result){
			this._super(category, query, buy_result);
			var products;
			if(query){
				products = this.pos.db.search_product_in_category(category.id,query);
				if (products.length === 0){
					var products = this.pos.db.get_coupon_products(query);
					this.product_list_widget.set_product_list(products);
				}
					
			}else{
				products = this.pos.db.get_product_by_category(this.category.id);
			}
		},
	})

	screens.ProductListWidget.include({
		render_product: function(product){
			// everytime render the product template
			this._super(product);
			var image_url = this.get_product_image_url(product);
            var product_html = QWeb.render('Product',{
                    widget:  this,
                    product: product,
                    image_url: this.get_product_image_url(product),
                });
            var product_node = document.createElement('div');
            product_node.innerHTML = product_html;
            product_node = product_node.childNodes[1];
            this.product_cache.cache_node(product.id,product_node);
            return product_node;
		}
	})
	
	var POSCoupons = screens.ActionButtonWidget.extend({
	    template: 'RedeemButton',
	    button_click: function(){
	        var order = this.pos.get_order();
            this.gui.show_popup('giftcard_pop',{
                title: _t('Enter Redeem Code'),
                value: '',
                confirm: function(coupon) {
                    order.add_coupon(coupon);
                },
            });
	    },
	});
	screens.define_action_button({
	    'name': 'poscoupon_btn',
	    'widget': POSCoupons,
	    'condition': function(){
	        return true;
	    },
	});

	var _super_orderline = models.Orderline.prototype;
	models.Orderline = models.Orderline.extend({
	    initialize: function(attr, options) {
	        _super_orderline.initialize.call(this,attr,options);
	        if (this.coupon){
	        	this.coupon = this.coupon;
	        }
	    },
	    init_from_JSON: function(json) { 
	        this.set_coupon(json.coupon); 
	        _super_orderline.init_from_JSON.call(this, json); 
	    },
	    can_be_merged_with: function(orderline){
	        if (orderline.coupon !== undefined){
	            return false;
	        }
	        _super_orderline.can_be_merged_with.call(this, orderline);
	    },
	    set_unit_price: function(price){
	    	var selectedOrder = this.pos.get_order();
	    	var totalamt = selectedOrder.get_total_with_tax();
	    	if (_.has(this, 'coupon') && this.coupon !== undefined){
	    		if (this.coupon.type === 'd'){
	    			return;
				}
	    		if (price > this.coupon.rem_amount || price > selectedOrder.get_total_with_tax()){
	    			this.pos.gui.current_screen.numpad.state.resetValue();
	    			return;
	    		}
	    	}
	    	_super_orderline.set_unit_price.call(this, price);
	    },
	    
	    set_coupon: function(coupon){
	        this.coupon= coupon;
	        this.trigger('change',this);
	    },
	    get_coupon: function(coupon){
	        return this.coupon;
	    },
	    
	    export_as_JSON: function() {
	    	var data = _super_orderline.export_as_JSON.apply(this, arguments);
	    	data['coupon'] = this.get_coupon();
	    	return data;
	    },

	    get_all_prices: function(){
			//Method Overwrite with coupon changes
	        if (this.get_coupon() && this.quantity > 0 && !this.set_percentage){
	            var price_unit = this.get_unit_price() * this.get_quantity() - this.get_discount()
	        }
	        else{
	            var price_unit = this.get_unit_price() * (1.0 - (this.get_discount() / 100.0));
	        }
            var taxtotal = 0;

            var product =  this.get_product();
            var taxes_ids = product.taxes_id;
            var taxes =  this.pos.taxes;
            var taxdetail = {};
            var product_taxes = [];

            _(taxes_ids).each(function(el){
                product_taxes.push(_.detect(taxes, function(t){
                    return t.id === el;
                }));
            });

            var all_taxes = this.compute_all(product_taxes, price_unit, this.get_quantity(), this.pos.currency.rounding);
            _(all_taxes.taxes).each(function(tax) {
                taxtotal += tax.amount;
                taxdetail[tax.id] = tax.amount;
            });

            return {
                "priceWithTax": all_taxes.total_included,
                "priceWithoutTax": all_taxes.total_excluded,
                "tax": taxtotal,
                "taxDetails": taxdetail,
            };
        },


	    get_base_price: function(){
            var rounding = this.pos.currency.rounding;
            if (this.get_coupon() && this.quantity > 0 && !this.set_percentage){
                return round_pr(this.get_unit_price() * this.get_quantity() - this.get_discount(), rounding);
            }
            return round_pr(this.get_unit_price() * this.get_quantity() * (1 - this.get_discount()/100), rounding);
        },

        get_unit_display_price:function(){
            var data = _super_orderline.get_unit_display_price.call(this);
            return data

        },

        get_discount_str: function(){
            if (this.get_coupon() && this.quantity > 0 && !this.set_percentage){
                return this.discountStr +' '+  this.pos.currency.symbol;
            }
            return this.discountStr + ' %';
        },

	});
	
	
	var _super_order = models.Order.prototype;
	models.Order = models.Order.extend({
		remove_orderline: function( line ){
		    var self = this;
	        if (line.get_coupon() && line.get_coupon().state != undefined){
				line.get_coupon().state = line.get_coupon().state.split('_')[0];
			}
	        _super_order.remove_orderline.apply(this, arguments);
	        self.update_coupon_line();
	    },
	    export_as_JSON: function() {
			var data = _super_order.export_as_JSON.apply(this, arguments);
			return data;
		},

		check_related: function(product, ref){
			var gc_product = this.pos.db.get_coupon_products(ref)
			if (gc_product.length > 0){
				if (gc_product[0].id !== product.id){
					this.pos.gui.show_popup('error',{
						title: _t('Not Allowed!'),
						body:  _t('Giftcard Nr. is not related to the product.'),
					});
					return true;
				}
			}
			return false;
		},
		update_coupon_line:function(){
		    var self = this;
		    var order = this.pos.get_order();
		    if (!order){
		        return;
		    }
		    var rem_amt = order.get_total_without_tax();
		    _.each(order.orderlines.models, function(line){
                if (line.coupon !== undefined){
                    if (rem_amt < line.coupon.rem_amount){
                        line.set_unit_price(rem_amt);
                        rem_amt -= order.get_total_without_tax();
                    }else{
                        line.set_unit_price(line.coupon.rem_amount);
                        rem_amt -= line.coupon.rem_amount;
                    }
                }
            })
		},

		add_product: function(product, options){
			var self = this;
			if (product && product.is_coupon && options === undefined){
				self.pos.gui.show_popup('GiftcardAdd',{
					title: _t('Enter GiftCard Code'),
                    confirm: function(ref){
						if (self.check_related(product, ref)){
							return;
						}
                        self.pos.check_coupon(ref);
                    }
				})
			}
			else{
				_super_order.add_product.apply(this, arguments);
				self.update_coupon_line();
			}
		},
		get_total_without_tax: function() {
            return round_pr(this.orderlines.reduce((function(sum, orderLine) {
                if (orderLine.product.is_coupon === false || orderLine.quantity > 0){
                    return sum + orderLine.get_price_without_tax();
                }
                else{
                    return sum + 0;
                }
            }), 0), this.pos.currency.rounding);
        },
        get_total_giftcard: function() {
            return round_pr(this.orderlines.reduce((function(sum, orderLine) {
                if (orderLine.coupon !== undefined && orderLine.quantity < 0){
                    return sum + orderLine.price;
                }
                else{
                    return sum + 0;
                }
            }), 0), this.pos.currency.rounding);
        },

        has_credit_note : function(){
            var credit_note = false;
            _.each(this.orderlines.models, function(line){
                if (line.coupon !== undefined && line.quantity < 0 && line.coupon.coupon_type === 'cn'){
                    credit_note = true;
                }
            })
            return credit_note;
        },

        clean_paymentlines: function() {
            var lines = this.paymentlines.models;
            var empty = [];
            for ( var i = 0; i < lines.length; i++) {
                empty.push(lines[i]);
            }
            for ( var i = 0; i < empty.length; i++) {
                this.remove_paymentline(empty[i]);
            }
        },

	});


	var _payment_line = models.Paymentline.prototype;
	models.Paymentline = models.Paymentline.extend({
	    export_as_JSON: function(){
	        var res = _payment_line.export_as_JSON.apply(this, arguments);
	        return res;
	    },

	})
	
	var _super_numpad = models.NumpadState.prototype;
	models.NumpadState = models.NumpadState.extend({
		deleteLastChar: function() {
			_super_numpad.deleteLastChar.apply(this, arguments);
			if(this.get('buffer') === ""){
				if(this.get('mode') === 'price'){
					this.trigger('set_value','remove');
				}
			}
		},
	});
	
	screens.OrderWidget.include({
		click_line: function(orderline, event) {
			var self = this;
			this._super(orderline, event);
			var $numpad =  $('div.numpad');
			if (_.has(orderline, 'coupon') &&  orderline.coupon !== undefined){
				$numpad.find('[data-mode="quantity"]').attr("disabled",true);
				if (orderline.quantity < 0){
					this.numpad_state.changeMode('price');
					$numpad.find('[data-mode="discount"]').attr("disabled",true);
				}
				else{
					this.numpad_state.changeMode(false);
//					$numpad.find('[data-mode="price"]').attr("disabled",true);
					if (!self.pos.config.allow_discount){
						$numpad.find('[data-mode="discount"]').attr("disabled",true);
						this.numpad_state.changeMode(false);
					}
					else{
						$numpad.find('[data-mode="discount"]').attr("disabled",false);
						this.numpad_state.changeMode('discount');
					}
				}
			}
			else{
				this.numpad_state.changeMode('quantity');
				$numpad.find('[data-mode="quantity"]').attr("disabled",false);
				$numpad.find('[data-mode="discount"]').attr("disabled",false);
				$numpad.find('.numpad-minus').attr("disabled",false);
				$numpad.find('[data-mode="price"]').attr("disabled",false);
			}
		},
		
		render_orderline: function(orderline){
			var self = this;
			var el_node = this._super(orderline);
			if ($(el_node).hasClass('selected')){
				$(el_node).find('#lineremove').on('click', function(e){
					self.removeline();
				});
			}
			return el_node;
		},
		removeline: function(){
			var line = this.pos.get_order().get_selected_orderline();
			line.set_quantity('remove');
		},
		update_summary: function(){
            var order = this.pos.get_order();
            if (!order.get_orderlines().length) {
                return;
            }

            var total = order ? order.get_total_with_tax() : 0;
            var giftcard =  order ? order.get_total_giftcard(): 0;
            // var total_with_giftcard  =  order ? total - giftcard: 0;
            var taxes = order ? total - order.get_total_without_tax() : 0;
            var due = order ? total - giftcard: 0;
            this.el.querySelector('.summary .total > .value').textContent = this.format_currency(total);
            this.el.querySelector('.summary .total .subentry .value').textContent = this.format_currency(taxes);
            this.el.querySelector('.summary .total .giftcard .value').textContent = this.format_currency(giftcard);
            this.el.querySelector('.summary .total .due .value').textContent = this.format_currency(due);

        },

	});

    screens.PaymentScreenWidget.include({
        click_numpad: function(button) {
            var order = this.pos.get_order();
            var paymentlines = this.pos.get_order().get_paymentlines();
            if (order.selected_paymentline.is_coupon){
                this.gui.show_popup('error',{
                    title: _t('Not Allowed!'),
                    body:  _t('Giftcard Payments can not be altered/removed!'),
                });
				return;
            }
            this._super(button);
        },
    });

    screens.ActionpadWidget.include({
        renderElement: function() {
            var self = this;
            this._super();
            this.$('.pay').click(function(){
                var order = self.pos.get_order();

                var coupon_amt = order.get_total_giftcard();
                order.clean_paymentlines();
                if (coupon_amt > 0){
                    if (order.has_credit_note()){
                        var gcRegister = _.filter(self.pos.cashregisters, function(cr){return cr.journal.is_credit_note});
                    }
                    else{
                        var gcRegister = _.filter(self.pos.cashregisters, function(cr){return cr.journal.coupon});
                    }

                    if (gcRegister.length > 0){
                        order.assert_editable();
                        var cashregister = gcRegister[0];
                        var newPaymentline = new models.Paymentline({},{order: order, cashregister:cashregister, pos: self.pos});
                        newPaymentline.set_amount(Math.max(coupon_amt,0));
                        newPaymentline['is_coupon'] = true;
                        order.paymentlines.add(newPaymentline);
                        order.select_paymentline(newPaymentline);
                        self.pos.gui.screen_instances.payment.reset_input();
                        self.pos.gui.screen_instances.payment.render_paymentlines();
                        self.pos.gui.screen_instances.payment.order_changes();
                    }
                }

            });
        },
    })

});