const prisma = require('../../config/prisma');

function obtenerFechaHoyLima() {
    const ahora = new Date();
    const limaStr = ahora.toLocaleDateString('en-CA', { timeZone: 'America/Lima' });
    return {
        fechaISO: limaStr,
        mesAnio: limaStr.slice(0, 7),
        fechaDate: new Date(`${limaStr}T00:00:00.000Z`)
    };
}

async function obtenerEstadoAforoHoy() {
    const { fechaISO, mesAnio, fechaDate } = obtenerFechaHoyLima();

    let config = await prisma.configuracionAforo.findUnique({ where: { mesAnio } });
    if (!config) {
        config = await prisma.configuracionAforo.findFirst({ orderBy: { idConfiguracion: 'desc' } });
    }
    const capacidadMensual = config ? config.capacidadMensual : 70;

    const bloqueo = await prisma.bloqueoDiario.findUnique({ where: { fecha: fechaDate } });
    const bloqueadosHoy = bloqueo ? bloqueo.cuposBloqueados : 0;

    const [reservasEsperadasHoy, ocupadosActuales, totalEstudiantesAptos] = await Promise.all([
        prisma.reserva.count({
            where: { fechaReserva: fechaDate, estadoReserva: 'PENDIENTE' }
        }),
        prisma.reserva.count({
            where: { fechaReserva: fechaDate, estadoReserva: { in: ['EN_CURSO', 'OCUPADO'] } }
        }),
        prisma.estudianteHabilitado.count({
            where: { esAptoParking: true }
        })
    ]);

    const disponiblesHoy = Math.max(
        0,
        capacidadMensual - bloqueadosHoy - ocupadosActuales - reservasEsperadasHoy
    );

    return {
        fecha: fechaISO,
        mesAnio,
        capacidadMensual,
        bloqueadosHoy,
        motivoBloqueoHoy: bloqueo?.motivo || null,
        ocupadosActuales,
        reservasEsperadasHoy,
        disponiblesHoy,
        totalEstudiantesAptos
    };
}

async function actualizarAforoMensual({ mesAnio, capacidadMensual, adminUsername }) {
    const capacidad = parseInt(capacidadMensual, 10);
    if (isNaN(capacidad) || capacidad < 1 || capacidad > 1000) {
        throw new Error('La capacidad mensual debe ser un número válido entre 1 y 1000.');
    }

    const periodo = mesAnio || obtenerFechaHoyLima().mesAnio;

    return await prisma.configuracionAforo.upsert({
        where: { mesAnio: periodo },
        update: {
            capacidadMensual: capacidad,
            actualizadoPor: adminUsername
        },
        create: {
            mesAnio: periodo,
            capacidadMensual: capacidad,
            actualizadoPor: adminUsername
        }
    });
}

async function registrarBloqueoDiario({ cuposBloqueados, motivo, garitaUsername }) {
    const { fechaDate } = obtenerFechaHoyLima();
    const cupos = parseInt(cuposBloqueados, 10);

    if (isNaN(cupos) || cupos < 0) {
        throw new Error('La cantidad de cupos bloqueados debe ser 0 o mayor.');
    }

    return await prisma.bloqueoDiario.upsert({
        where: { fecha: fechaDate },
        update: {
            cuposBloqueados: cupos,
            motivo: motivo?.trim() || 'Contingencia operativa en garita',
            registradoPor: garitaUsername
        },
        create: {
            fecha: fechaDate,
            cuposBloqueados: cupos,
            motivo: motivo?.trim() || 'Contingencia operativa en garita',
            registradoPor: garitaUsername
        }
    });
}

module.exports = {
    obtenerEstadoAforoHoy,
    actualizarAforoMensual,
    registrarBloqueoDiario
};