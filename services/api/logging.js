const express = require('express');
const router = express.Router()
const path = require('path');
const Ajv = require('ajv');
const P = require('bluebird');
const execAsync = P.promisify(require('child_process').exec);
const unlink = P.promisify(require('fs').unlink);
const format = require('util').format;
const logger = require('./logger');

const { createError } = require('./utils')
const { routesWithAuth } = require('./auth')

const packTimeout = 1000;
class PackLogsError extends Error {
    constructor (message, status) {
        super(message);
        this.name = this.constructor.name;
        // Capturing stack trace, excluding constructor call from it.
        Error.captureStackTrace(this, this.constructor);
        this.status = status || 500;
    }
};

const ajv = new Ajv();
const patchSchema = {
    type: 'object',
    properties: {
        level: {
            type: 'string',
            enum: ['DEBUG', 'INFO', 'NOTICE', 'WARNING', 'ERROR']
        }
    },
    required:['level'],
    additionalProperties: false
}

const patchValidator = ajv.compile(patchSchema);

function validatePatch(req, res, next) {
    if(!patchValidator(req.body)) {
        return next(createError(400, patchValidator.errors));
    }
    next();
}

function patchLogging(req, res, next) {



}

async function packLogs(outputZipFile) {
    /* zip the syslog and jager's log
     *
     */
    try {
        await execAsync(format('sudo zip %s /var/jagerlog/syslog* /var/jagerlog/jager/*', outputZipFile), {timeout: packTimeout});
    } catch(err) {
        throw new PackLogsError(err);
    }
}



async function getLogZip(req, res, next) {
    const zipFile = 'logs.zip'
    try {
        await packLogs(zipFile);
        res.status(200).sendFile(path.join(__dirname, zipFile));
        //await unlink(path.join(__dirname, zipFile));
    } catch(err) {
        logger.error(err);
        return next(createError(500));
    }

    // TODO: delete logs.zip
}

/*
 * Routing Table
 */
routesWithAuth(
    router,
    ['get', '/logging', getLogZip],
    ['patch', '/logging', validatePatch, patchLogging],
)

module.exports = router
