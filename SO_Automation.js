/**
 * @NApiVersion 2.1
 * @NScriptType Restlet
 */
define(['N/record', 'N/log', 'N/search'], function (record, log, search) {

    function post(context) {
        try {
            log.debug('Incoming Payload', JSON.stringify(context));

            if (!context.user) {
                return sendError('MISSING_EMAIL', 'User email is missing.');
            }

            var customerId = getCustomerByEmail(context.user);

            if (!customerId) {
                return sendError('CUSTOMER_NOT_FOUND', 'Customer not found for email: ' + context.user);
            }

            var itemList = context.item_list || [];

            if (!itemList || itemList.length === 0) {
                return sendError('NO_ITEMS', 'No item_list found in payload.');
            }

            if (!context.otherrefnum) {
                return sendError('MISSING_PO', 'PO # / otherrefnum is missing.');
            }

            // if (!context.location) {
            //     return sendError('MISSING_LOCATION', 'Location is missing.');
            // }
            var locationId = context.location ? Number(context.location) : 7;

            var quoteRec = record.create({
                type: record.Type.ESTIMATE,
                isDynamic: true
            });

            quoteRec.setValue({
                fieldId: 'entity',
                value: Number(customerId)
            });

            quoteRec.setValue({
                fieldId: 'otherrefnum',
                value: String(context.otherrefnum)
            });

            quoteRec.setValue({
                fieldId: 'location',
                value: locationId  //Number(context.location)
            });

            if (context.project_name) {
                quoteRec.setValue({
                    fieldId: 'memo',
                    value: String(context.project_name)
                });
            }

            if (context.zip) {
                quoteRec.setValue({
                    fieldId: 'shipzip',
                    value: String(context.zip)
                });
            }

            for (var i = 0; i < itemList.length; i++) {
                var line = itemList[i];

                var itemId = line.ItemNumber;

                if (!itemId && line.sku) {
                    itemId = getItemBySku(line.sku);
                }

                if (!itemId) {
                    return sendError('ITEM_NOT_FOUND', 'Item not found. SKU: ' + line.sku);
                }

                quoteRec.selectNewLine({
                    sublistId: 'item'
                });

                quoteRec.setCurrentSublistValue({
                    sublistId: 'item',
                    fieldId: 'item',
                    value: Number(itemId),
                    forceSyncSourcing: true
                });

                quoteRec.setCurrentSublistValue({
                    sublistId: 'item',
                    fieldId: 'quantity',
                    value: Number(line.quantity) || 1
                });

                quoteRec.setCurrentSublistValue({
                    sublistId: 'item',
                    fieldId: 'location',
                    value: locationId // Number(context.location),
                    forceSyncSourcing: true
                });

                if (line.price || line.price === 0) {
                    quoteRec.setCurrentSublistValue({
                        sublistId: 'item',
                        fieldId: 'price',
                        value: -1,
                        forceSyncSourcing: true
                    });

                    quoteRec.setCurrentSublistValue({
                        sublistId: 'item',
                        fieldId: 'rate',
                        value: Number(line.price)
                    });
                }

                quoteRec.commitLine({
                    sublistId: 'item'
                });
            }

            log.debug('Before Save Values', {
                entity: quoteRec.getValue({ fieldId: 'entity' }),
                otherrefnum: quoteRec.getValue({ fieldId: 'otherrefnum' }),
                location: quoteRec.getValue({ fieldId: 'location' })
            });

            var quoteId = quoteRec.save({
                enableSourcing: true,
                ignoreMandatoryFields: false
            });

            return {
                success: true,
                quoteId: quoteId,
                message: 'Quote created successfully'
            };

        } catch (e) {
            log.error('RESTlet Error', e);

            return {
                success: false,
                name: e.name,
                message: e.message,
                stack: e.stack
            };
        }
    }

    function getCustomerByEmail(email) {
        var customerSearchObj = search.create({
            type: search.Type.CUSTOMER,
            filters: [
                ['email', 'is', String(email)]
            ],
            columns: [
                search.createColumn({ name: 'internalid' })
            ]
        });

        var results = customerSearchObj.run().getRange({
            start: 0,
            end: 1
        });

        if (results && results.length > 0) {
            return results[0].getValue({
                name: 'internalid'
            });
        }

        return null;
    }

    function getItemBySku(sku) {
        var itemSearchObj = search.create({
            type: search.Type.ITEM,
            filters: [
                ['itemid', 'is', String(sku)]
            ],
            columns: [
                search.createColumn({ name: 'internalid' })
            ]
        });

        var results = itemSearchObj.run().getRange({
            start: 0,
            end: 1
        });

        if (results && results.length > 0) {
            return results[0].getValue({
                name: 'internalid'
            });
        }

        return null;
    }

    function sendError(name, message) {
        log.error(name, message);

        return {
            success: false,
            name: name,
            message: message
        };
    }

    return {
        post: post
    };
});