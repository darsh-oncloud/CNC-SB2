/**
 * @NApiVersion 2.1
 * @NScriptType Restlet
 */
define(['N/record', 'N/log', 'N/search'], function (record, log, search) {

    var DEFAULT_LOCATION_ID = 7;

    function post(context) {
        try {
            log.debug('Incoming Payload', JSON.stringify(context));

            if (isEmpty(context.user)) {
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

            if (isEmpty(context.otherrefnum)) {
                return sendError('MISSING_PO', 'PO # / otherrefnum is missing.');
            }

            var otherRefNum = String(context.otherrefnum).trim();

            var locationId = DEFAULT_LOCATION_ID;

            if (!isEmpty(context.location)) {
                locationId = Number(String(context.location).trim());

                if (!locationId || isNaN(locationId)) {
                    return sendError('INVALID_LOCATION', 'Invalid location passed: ' + context.location);
                }
            }

            var existingQuote = getQuoteByOtherRefNum(otherRefNum);

            var quoteRec;
            var isUpdate = false;

            if (existingQuote && existingQuote.id) {

                if (!isOpenStatus(existingQuote.statusText)) {
                    return {
                        success: false,
                        name: 'QUOTE_ALREADY_EXISTS',
                        message: 'Quote already exists for PO # ' + otherRefNum + ' but status is not Open.',
                        quoteId: existingQuote.id,
                        quoteNumber: existingQuote.tranid,
                        status: existingQuote.statusText
                    };
                }

                isUpdate = true;

                quoteRec = record.load({
                    type: record.Type.ESTIMATE,
                    id: existingQuote.id,
                    isDynamic: true
                });

                removeAllItemLines(quoteRec);

            } else {

                quoteRec = record.create({
                    type: record.Type.ESTIMATE,
                    isDynamic: true
                });

                quoteRec.setValue({
                    fieldId: 'entity',
                    value: Number(customerId)
                });
            }

            quoteRec.setValue({
                fieldId: 'otherrefnum',
                value: otherRefNum
            });

            quoteRec.setValue({
                fieldId: 'location',
                value: locationId
            });

            if (!isEmpty(context.project_name)) {
                quoteRec.setValue({
                    fieldId: 'memo',
                    value: String(context.project_name)
                });
            }

            if (!isEmpty(context.zip)) {
                quoteRec.setValue({
                    fieldId: 'shipzip',
                    value: String(context.zip)
                });
            }

            var itemCache = {};

            for (var i = 0; i < itemList.length; i++) {
                var line = itemList[i];

                var itemId = line.ItemNumber;

                if (!itemId && !isEmpty(line.sku)) {
                    var sku = String(line.sku).trim();

                    if (itemCache[sku]) {
                        itemId = itemCache[sku];
                    } else {
                        itemId = getItemBySku(sku);
                        itemCache[sku] = itemId;
                    }
                }

                if (!itemId) {
                    return sendError('ITEM_NOT_FOUND', 'Item not found. SKU: ' + line.sku);
                }

                var quantity = Number(line.quantity) || 1;

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
                    value: quantity
                });

                quoteRec.setCurrentSublistValue({
                    sublistId: 'item',
                    fieldId: 'location',
                    value: locationId,
                    forceSyncSourcing: true
                });

                quoteRec.commitLine({
                    sublistId: 'item'
                });
            }

            log.debug('Before Save Values', {
                mode: isUpdate ? 'UPDATE_EXISTING_QUOTE' : 'CREATE_NEW_QUOTE',
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
                mode: isUpdate ? 'updated_existing_quote' : 'created_new_quote',
                message: isUpdate ? 'Existing open Quote updated successfully' : 'Quote created successfully'
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

    function getQuoteByOtherRefNum(otherRefNum) {
        var quoteSearchObj = search.create({
            type: search.Type.ESTIMATE,
            filters: [
                ['mainline', 'is', 'T'],
                'AND',
                ['otherrefnum', 'is', String(otherRefNum)]
            ],
            columns: [
                search.createColumn({ name: 'internalid' }),
                search.createColumn({ name: 'tranid' }),
                search.createColumn({ name: 'status' })
            ]
        });

        var results = quoteSearchObj.run().getRange({
            start: 0,
            end: 10
        });

        if (!results || results.length === 0) {
            return null;
        }

        var firstQuote = null;

        for (var i = 0; i < results.length; i++) {
            var quoteObj = {
                id: results[i].getValue({ name: 'internalid' }),
                tranid: results[i].getValue({ name: 'tranid' }),
                statusText: results[i].getText({ name: 'status' }) || results[i].getValue({ name: 'status' })
            };

            if (!firstQuote) {
                firstQuote = quoteObj;
            }

            if (isOpenStatus(quoteObj.statusText)) {
                return quoteObj;
            }
        }

        return firstQuote;
    }

    function removeAllItemLines(quoteRec) {
        var lineCount = quoteRec.getLineCount({
            sublistId: 'item'
        });

        for (var i = lineCount - 1; i >= 0; i--) {
            quoteRec.removeLine({
                sublistId: 'item',
                line: i,
                ignoreRecalc: true
            });
        }
    }

    function isOpenStatus(statusText) {
        if (isEmpty(statusText)) {
            return false;
        }

        return String(statusText).toLowerCase().indexOf('open') !== -1;
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

    function isEmpty(value) {
        return value === null || value === undefined || String(value).trim() === '';
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