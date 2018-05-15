const express = require('express');
const router = express.Router();
const Ajv = require('ajv');
const P = require('bluebird');

const config = require('./config').services.api.settings;
const models = require('./database');
const settingsModel = P.promisifyAll(models['settings']);
const { createError } = require('./utils');
const { routesWithAuth } = require('./auth');
const { resetNetworkInterface, ResetNetworkError } = require('./settings_utils');

const dataPortInterface = config.data_port.device;

const ajv = new Ajv();
const settingPatchSchema = {
    'anyOf': [
        {
            type: 'object',
            properties: {
                mode: {
                    type: 'string',
                    pattern: '^static$',
                },
                address: {
                    type: 'string',
                    format: 'ipv4'
                },
                gateway: {
                    type: 'string',
                    format: 'ipv4'
                },
                netmask: {
                    type: 'string',
                    format: 'ipv4'
                }
            },
            additionalProperties: false,
            required: ['mode', 'address', 'gateway', 'netmask']
        },
        {
            type: 'object',
            properties: {
                mode: {
                    type: 'string',
                    pattern: '^dhcp$',
                },
            },
            additionalProperties: false
        },
    ]
}

const settingPatchValidator = ajv.compile(settingPatchSchema);

function validateSettingPatch(req, res, next) {
    if(!settingPatchValidator(req.body)) {
        // TODO: return msg should be refine
        return next(createError(400, settingPatchValidator.errors));
    }
    next();
}

async function patchSettings(req, res, next) {
    let query = {}
    let body = req.body

    let mode = body.mode;
    let addr = body.address;
    let netmask = body.netmask;
    let gateway = body.gateway;

    let newSettings = {};
    newSettings.mode = mode;
    newSettings.address = addr;
    newSettings.netmask = netmask;
    newSettings.gateway = gateway;
    newSettings.status = 'processing';
    await settingsModel.updateAsync({'_id': 1}, newSettings, {'upsert': true});
    res.status(200).send();
    // start configure network interface
    try {
        await resetNetworkInterface(dataPortInterface, mode, addr, netmask, gateway);
    } catch (err) {
        if (err instanceof ResetNetworkError) {
            newSettings.status = 'failed';
            await settingsModel.updateAsync({'_id': 1}, newSettings, {'upsert': true});
        }
        // TODO: logging
        console.error(err);
    };
}

async function getSettings(req, res, next) {
    return settingsModel.findOne({'_id': 1})
    .then((result) =>{
        if(result.mode === 'dhcp') {
            result.netmask = undefined;
            result.gateway = undefined;
            if(result.status == 'processing') {
                result.address = 'None'
            }
        }
        res.status(200).send(result);
    });
}

async function createDefaultNetworkSetting() {
    let result = await settingsModel.findOne({'_id': 1});
    if(!result) {
        // create default network setting
        let defaultSettings = {};
        defaultSettings.mode = 'dhcp';
        defaultSettings.address = 'None';
        defaultSettings.status = 'processing';
        try {
            await settingsModel.updateAsync({'_id': 1}, defaultSettings, {'upsert': true});
            await resetNetworkInterface(dataPortInterface ,'dhcp');
        } catch (err) {
            // TODO: logging
            if (err instanceof ResetNetworkError) {
                defaultSettings.status = 'failed';
                await settingsModel.updateAsync({'_id': 1}, defaultSettings, {'upsert': true});
            }
            console.error(err)
        }
    }
}


/*
 * Routing Table
 */
routesWithAuth(
    router,
    ['get', '/settings', getSettings],
    ['patch', '/settings', validateSettingPatch, patchSettings],
)

module.exports = {
    settings: router,
    createDefaultNetworkSetting
}
