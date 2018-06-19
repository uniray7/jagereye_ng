const ROLES = {
    ADMIN: 'admin',
    WRITER: 'writer',
    READER: 'reader',
}

// analyzer status mapping
const analyzerStatus = ['created','starting','running','source_down','stopped']

module.exports = {
    ROLES,
    analyzerStatus,
}
