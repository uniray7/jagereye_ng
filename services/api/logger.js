const os = require('os');
const forEach = require('lodash/forEach');
const includes = require('lodash/includes');
const winston = require('winston');
const { combine, printf } = winston.format;
// Requiring 'winston-syslog' will expose
// 'winston.transports.Syslog'
require('winston-syslog').Syslog;

const config = require('./config').logging;

class ChangeLogLevelError extends Error {
    constructor (message, status) {
        super(message);
        this.name = this.constructor.name;
        // Capturing stack trace, excluding constructor call from it.
        Error.captureStackTrace(this, this.constructor);
        this.status = status || 500;
    }
};

function addTraceStack(logger) {
    /* Make logger can record stackTrace for ['emerg', 'alert', 'crit', 'error'] level
     *
     */

    const logLevels = ['emerg', 'alert', 'crit', 'error'];

    forEach(logLevels, (level) => {
        const oldLogFunc = logger[level];
        logger[level] = function() {
            const args = Array.prototype.slice.call(arguments, 0);
            if (args[0] instanceof Error) {
                args[0] = args[0].stack;
            }
            return oldLogFunc.apply(this, args);
        };
    });
    return logger;
}


function createLogger() {
    // set log tranports
    const transports = [];
    if (config.transports.stdout.default_enabled) {
        transports.push(new (winston.transports.Console)());
    }
    if (config.transports.syslog.default_enabled) {
        const options = {
            host: config.transports.syslog.host,
            port: config.transports.syslog.port,
            protocol: config.transports.syslog.protocol,
            facility: config.transports.syslog.facility,
            localhost: os.hostname(),
            app_name: '-api-jagereye'
        };
        transports.push(new winston.transports.Syslog(options));
    }
    // set log format
    const logFormat = printf(info => {
        return `- ${info.level.toUpperCase()} - api - jagereye[${process.pid}]: ${info.message}`;
    });

    const logger = winston.createLogger ({
        levels: winston.config.syslog.levels,
        transports: transports,
        format: combine(logFormat)
    });
    return addTraceStack(logger);
}

const logger = createLogger();
logger.changeLevel = function(level) {
    /*
     * Change the level of the logger
     * @param {string} level - Valid value:
     *      ['emerg', 'alert', 'crit', 'error', 'warning', 'notice', 'info', 'debug']
     */
    const validLevels = Object.keys(winston.config.syslog.levels);
    if (!includes(validLevels, level)) {
        throw new ChangeLogLevelError();
    }
    forEach(logger.transports, (transport) => {
        transport.level = level;
    });
}

module.exports = logger;
