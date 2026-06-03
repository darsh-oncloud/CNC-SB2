/**
 * @NApiVersion 2.1
 * @NScriptType Restlet
 */
define(['N/record', 'N/log'], function (record, log) {

    function post(context) {
        try {
            log.debug('Incoming Payload', JSON.stringify(context));

            var soRec = record.create({
                type: record.Type.SALES_ORDER,
                isDynamic: true
            });

            // Header
            soRec.setValue({
                fieldId: 'entity',
                value: Number(context.customer)
            });

            if (context.otherrefnum) {
                soRec.setValue({
                    fieldId: 'otherrefnum',
                    value: String(context.otherrefnum)
                });
            }

            if (context.location) {
                soRec.setValue({
                    fieldId: 'location',
                    value: Number(context.location)
                });
            }

            if (context.memo) {
                soRec.setValue({
                    fieldId: 'memo',
                    value: String(context.memo)
                });
            }

            if (context.trandate) {
                soRec.setValue({
                    fieldId: 'trandate',
                    value: new Date(context.trandate)
                });
            }

            // Lines
            if (context.items && context.items.length > 0) {
                for (var i = 0; i < context.items.length; i++) {
                    var line = context.items[i];

                    log.debug('Adding Item Line', line);

                    soRec.selectNewLine({
                        sublistId: 'item'
                    });

                    soRec.setCurrentSublistValue({
                        sublistId: 'item',
                        fieldId: 'item',
                        value: Number(line.item),
                        forceSyncSourcing: true
                    });

                    soRec.setCurrentSublistValue({
                        sublistId: 'item',
                        fieldId: 'quantity',
                        value: Number(line.quantity) || 1
                    });

                    // Custom price level
                    if (line.rate || line.rate === 0) {
                        soRec.setCurrentSublistValue({
                            sublistId: 'item',
                            fieldId: 'price',
                            value: -1,
                            forceSyncSourcing: true
                        });

                        soRec.setCurrentSublistValue({
                            sublistId: 'item',
                            fieldId: 'rate',
                            value: Number(line.rate)
                        });
                    }

                    if (line.location) {
                        soRec.setCurrentSublistValue({
                            sublistId: 'item',
                            fieldId: 'location',
                            value: Number(line.location),
                            forceSyncSourcing: true
                        });
                    }

                    soRec.commitLine({
                        sublistId: 'item'
                    });
                }
            }

            var soId = soRec.save({
                enableSourcing: true,
                ignoreMandatoryFields: false
            });

            log.audit('Sales Order Created', soId);

            return {
                success: true,
                salesOrderId: soId,
                message: 'Sales Order created successfully'
            };

        } catch (e) {
            log.error('RESTlet Error', e);

            return {
                success: false,
                message: e.message,
                name: e.name,
                stack: e.stack
            };
        }
    }

    return {
        post: post
    };
});