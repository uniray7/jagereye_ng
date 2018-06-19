const express = require('express')
const router = express.Router()
const { routesWithAuth } = require('./auth')
const { createError } = require('./utils')
const request = require('request-promise-native')
const config = require('./config')
const models = require('./database')
const assert = require('assert')
const { analyzerStatus } = require('./constants')

const MAX_ANALYZERS = 8  // TODO: should get from config file

const PROMETHEUS_URL = config.services.prometheus.params.endpoint_url + '/' +
                       config.services.prometheus.params.api_version
const PROMETHEUS_PREFIX = PROMETHEUS_URL + '/query?query='

var memTotal = 0, systemDiskSize = 0, dataDiskSize = 0

async function getStatus(req, res, next) {
    let cpu = 0, memAvail = 0, systemDiskFree = 0, dataDiskFree = 0, analyzers, targets, camera

    try {
        cpu = await request(PROMETHEUS_PREFIX + '100 - (avg by (instance) (irate(node_cpu{job="node",mode="idle"}[5m])) * 100)', { json: true })
        if( memTotal === 0 ) {
            memTotal = await request(PROMETHEUS_PREFIX + '(avg_over_time(node_memory_MemTotal[5m]))/1024/1024/1024', { json: true })
            memTotal = getPrometheusReturnValue(memTotal)
        }
        memAvail = await request(PROMETHEUS_PREFIX + '(avg_over_time(node_memory_MemAvailable[5m]))/1024/1024/1024', { json: true })
        if( systemDiskSize === 0 ) {
            systemDiskSize = await request(PROMETHEUS_PREFIX + '(node_filesystem_size{fstype="ext4", mountpoint="/"})/1024/1024/1024', { json: true })
            systemDiskSize = getPrometheusReturnValue(systemDiskSize)
        }
        systemDiskFree = await request(PROMETHEUS_PREFIX + '(node_filesystem_free{fstype="ext4", mountpoint="/"})/1024/1024/1024', { json: true })
        if( dataDiskSize === 0 ) {
            dataDiskSize = await request(PROMETHEUS_PREFIX + '(node_filesystem_size{fstype="ext4", mountpoint="/data"})/1024/1024/1024', { json: true })
            dataDiskSize = getPrometheusReturnValue(dataDiskSize)
        }
        dataDiskFree = await request(PROMETHEUS_PREFIX + '(node_filesystem_free{fstype="ext4", mountpoint="/data"})/1024/1024/1024', { json: true })
        camera = await models['analyzers'].count({})
        analyzers = await request(PROMETHEUS_PREFIX + 'analyzer_status', { json: true })
        targets = await request(PROMETHEUS_URL + '/targets', { json: true })
    } catch(e) {
        return next(createError(500, e))
    }
    let result = {
        timestamp: new Date().getTime(),
        usage: [],
        analyzers: [],
        services: []
    }
    // cpu
    if (cpu['status'] === 'success') {
        result.usage.push({
            name: 'cpu',
            unit: '%',
            used: getPrometheusReturnValue(cpu).toFixed(2),
            total: '100'
        })
    } else {
        result.usage.push({
            name: 'cpu',
            unit: '%',
            used: 'NaN',
            total: 'NaN'
        })
    }
    // memory
    if (memAvail['status'] === 'success') {
        memAvail = getPrometheusReturnValue(memAvail)
        let memUsed = memTotal - memAvail
        result.usage.push({
            name: 'memory',
            unit: 'GB',
            used: memUsed.toFixed(2),
            total: memTotal.toFixed(2)
        })
    } else {
        result.usage.push({
            name: 'memory',
            unit: 'GB',
            used: 'NaN',
            total: 'NaN'
        })
    }
    // systemDisk
    if (systemDiskFree['status'] === 'success') {
        systemDiskFree = getPrometheusReturnValue(systemDiskFree)
        let systemDiskUsed = systemDiskSize - systemDiskFree
        result.usage.push({
            name: 'systemDiskCapacity',
            unit: 'GB',
            used: systemDiskUsed.toFixed(2),
            total: systemDiskSize.toFixed(2)
        })
    } else {
        result.usage.push({
            name: 'systemDiskCapacity',
            unit: 'GB',
            used: 'NaN',
            total: 'NaN'
        })
    }
    // dataDisk
    if (dataDiskFree['status'] === 'success') {
        dataDiskFree = getPrometheusReturnValue(dataDiskFree)
        let dataDiskUsed = dataDiskSize - dataDiskFree
        result.usage.push({
            name: 'dataDiskCapacity',
            unit: 'GB',
            used: dataDiskUsed.toFixed(2),
            total: dataDiskSize.toFixed(2)
        })
    } else {
        result.usage.push({
            name: 'dataDiskCapacity',
            unit: 'GB',
            used: 'NaN',
            total: 'NaN'
        })
    }
    // camera
    result.usage.push({
        name: 'numOfCameras',
        unit: '',
        used: camera,
        total: MAX_ANALYZERS
    })
    // analyzers
    if (analyzers['status'] === 'success' && analyzers['data'] && analyzers['data']['result']) {
        analyzers = analyzers['data']['result']
        assert(Array.isArray(analyzers))
        for(let i = 0 ; i < analyzers.length ; i++) {
            let statusCode = parseInt(analyzers[i]['value'][1])
            result.analyzers.push({
                analyzer : analyzers[i]['metric']['analyzer'],
                status : statusCode === -1 ? 'unknown' : analyzerStatus[statusCode]
            })
        }
    }
    // targets
    if (targets['status'] === 'success' && targets['data'] && targets['data']['activeTargets']) {
        targets = targets['data']['activeTargets']
        assert(Array.isArray(targets))
        for(let i = 0 ; i < targets.length ; i++) {
            result.services.push({
                service: targets[i].labels.job,
                status: targets[i].health
            })
        }
    } else {
        result.services = 'NaN' 
    }

    return res.send(result)
}

function getPrometheusReturnValue(ret) {
    try {
        const result = parseFloat(ret.data.result[0].value[1])
        return result
    } catch(e) {
        return 0
    }
}

/*
 * Routing Table
 */
routesWithAuth(
    router,
    ['get', '/system/status', getStatus],
)

module.exports = router