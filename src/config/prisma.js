const { PrismaClient } = require('@prisma/client');

const urlBase = process.env.DATABASE_URL || '';
const separador = urlBase.includes('?') ? '&' : '?';
const urlConPool = urlBase.includes('connection_limit')
    ? urlBase
    : `${urlBase}${separador}connection_limit=5&pool_timeout=20`;

const prisma = new PrismaClient({
    datasources: {
        db: { url: urlConPool }
    }
});

module.exports = prisma;