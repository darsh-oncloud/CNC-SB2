/**
 * @NApiVersion 2.1
 * @NScriptType Restlet
 */
define(['N/record', 'N/log', 'N/search'], function (record, log, search) {

    function post(context) {
        try {
            log.debug('Incoming Payload', JSON.stringify(context));

            var userEmail = context.user;

            if (!userEmail) {
                return errorResponse('MISSING_EMAIL', 'User email is missing in payload.');
            }

            var customerId = getCustomerByEmail(userEmail);

            if (!customerId) {
                return errorResponse('CUSTOMER_NOT_FOUND', 'No customer found with email: ' + userEmail);
            }

            var itemList = context.item_list || [];

            if (!itemList || itemList.length === 0) {
                return errorResponse('NO_ITEMS', 'No item_list found in payload.');
            }

            var quoteRec = record.create({
                type: record.Type.ESTIMATE,
                isDynamic: true
            });

            // Customer
            quoteRec.setValue({
                fieldId: 'entity',
                value: Number(customerId),
                forceSyncSourcing: true
            });

            // Header fields from payload
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

            // Optional dynamic body fields
            // Example:
            // "body_fields": {
            //    "custbody_field_id": "value"
            // }
            if (context.body_fields) {
                setBodyFields(quoteRec, context.body_fields);
            }

            // Item lines
            for (var i = 0; i < itemList.length; i++) {
                var line = itemList[i];

                var itemId = line.ItemNumber;

                // If ItemNumber is blank/null, search item by SKU
                if (!itemId && line.sku) {
                    itemId = getItemBySku(line.sku);
                }

                if (!itemId) {
                    return errorResponse(
                        'ITEM_NOT_FOUND',
                        'Item not found for line ' + (i + 1) + '. SKU: ' + line.sku
                    );
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

                // Optional dynamic line fields
                // Example:
                // "line_fields": {
                //    "custcol_field_id": "value"
                // }
                if (line.line_fields) {
                    setLineFields(quoteRec, line.line_fields);
                }

                quoteRec.commitLine({
                    sublistId: 'item'
                });
            }

            var quoteId = quoteRec.save({
                enableSourcing: true,
                ignoreMandatoryFields: false
            });

            log.audit('Quote Created', quoteId);

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

    function setBodyFields(recObj, fieldsObj) {
        for (var fieldId in fieldsObj) {
            if (fieldsObj.hasOwnProperty(fieldId)) {
                if (fieldsObj[fieldId] !== null && fieldsObj[fieldId] !== '') {
                    recObj.setValue({
                        fieldId: fieldId,
                        value: fieldsObj[fieldId]
                    });
                }
            }
        }
    }

    function setLineFields(recObj, fieldsObj) {
        for (var fieldId in fieldsObj) {
            if (fieldsObj.hasOwnProperty(fieldId)) {
                if (fieldsObj[fieldId] !== null && fieldsObj[fieldId] !== '') {
                    recObj.setCurrentSublistValue({
                        sublistId: 'item',
                        fieldId: fieldId,
                        value: fieldsObj[fieldId]
                    });
                }
            }
        }
    }

    function errorResponse(name, message) {
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