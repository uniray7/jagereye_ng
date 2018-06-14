const express = require('express');
const router = express.Router()
const path = require('path');
const Ajv = require('ajv');
const format = require('util').format;
const P = require('bluebird');
const execAsync = P.promisify(require('child_process').exec);
const unlink = P.promisify(require('fs').unlink);

const config = require('./config.js');
const logger = require('./logger');
const models = require('./database');
const sysModel = P.promisifyAll(models['system']);

const { createError } = require('./utils')
const { routesWithAuth } = require('./auth')

const packTimeout = 1000;
class PackLogsError extends Error {
/**
 * An error class will be throw when packLogs() failed
 */
    constructor (message, status) {
        super(message);
        this.name = this.constructor.name;
        // Capturing stack trace, excluding constructor call from it.
        Error.captureStackTrace(this, this.constructor);
        this.status = status || 500;
    }
};

async function packLogs(outputZipFile) {
    /* Zip the syslog and jager's log
     * @param   {string} outputZipFile  the path of output zip file
     *
     * @throw   {PackLogsError}
     */
    try {
        const syslogPath = path.join(config.services.api.logging_mount.target, 'syslog*');
        const jagerlogPath = path.join(config.services.api.logging_mount.target, 'jager/*');
        await execAsync(format('sudo zip %s %s %s', outputZipFile, syslogPath, jagerlogPath), {timeout: packTimeout});
    } catch(err) {
        throw new PackLogsError(err);
    }
}

async function getLoggingBundle(req, res, next) {
    /**
     * Middleware of GET /system/logging/bundle
     */
    const zipFile = 'logs.zip'
    try {
        await packLogs(zipFile);
        res.status(200).sendFile(path.join(__dirname, zipFile));
    } catch(err) {
        logger.error(err);
        return next(createError(500));
    }
}

const ajv = new Ajv();
const patchSchema = {
    type: 'object',
    properties: {
        debugMode: {type: 'boolean'}
    },
    required:['debugMode'],
    additionalProperties: false
}
const patchValidator = ajv.compile(patchSchema);

function validatePatch(req, res, next) {
    /**
     * Middleware to validate body for PATCH /system/logging
     */

    if(!patchValidator(req.body)) {
        return next(createError(400, patchValidator.errors));
    }
    next();
}


async function patchLogging(req, res, next) {
    /**
     * Middleware of PATCH /system/logging
     */

    // save new setting into DB
    let setting = req.body;
    try {
        await sysModel.update({_id: 'logging'}, {content: setting});
        if (req.body.debugMode) {
            logger.changeLevel('debug');
        }
        else {
            logger.changeLevel('info');
        }
        return res.status(200).send();
    } catch (err) {
        logger.error(err);
        return next(createError(500));
    }
}


async function getLogging(req, res, next) {
    /**
     * Middleware of GET /system/logging
     */

    // get logging config from db
    try {
        let setting = await sysModel.findOne({'_id': 'logging'});
        // response back
        res.status(200).send(setting.content);
    } catch (err) {
        logger.error(err);
        return next(createError(500));
    }
}


async function setupLogger() {
    /**
     * Setup the logger when API server start
     */

    // check if there exist logging config in DB
    try {
        let setting = await sysModel.findOne({'_id': 'logging'});
        if(!setting) {
            // if not existed, create default network setting
            const defaultSetting = {};
            const content = {};
            content.debugMode = false;

            defaultSetting._id = 'logging';
            defaultSetting.content = content;
            try {
                await sysModel.create(defaultSetting);
            } catch (err) {
                // TODO: logging
                console.error(err)
            }
            setting = defaultSetting;
        }
        // setup debug level of the logger
        if (setting.content.debugMode) {
            logger.changeLevel('debug');
        }
        else {
            logger.changeLevel('info');
        }
    } catch (err) {
        // TODO: logging
        console.error(err)
    }
}

/*
 * Routing Table
 */
routesWithAuth(
    router,
    ['get', '/system/logging/bundle', getLoggingBundle],
    ['get', '/system/logging', getLogging],
    ['patch', '/system/logging', validatePatch, patchLogging],
)

module.exports = {
    loggingRouter: router,
    setupLogger
}
