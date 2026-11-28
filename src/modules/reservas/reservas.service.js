const prisma = require('../../config/prisma');
const QRCode = require('qrcode');

const TOLERANCIA_MINUTOS = 20;

function obtenerFechaHoyLimaDate() {
    const limaStr = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Lima' });
    return new Date(`${limaStr}T00:00:00.000Z`);
}

function obtenerHoraActualLimaDate() {
    const limaHoraActual = new Date().toLocaleTimeString('en-GB', {
        timeZone: 'America/Lima',
        hour12: false
    });
    return new Date(`1970-01-01T${limaHoraActual}.000Z`);
}

function normalizarHoraUtcDate(horaValor) {
    if (horaValor instanceof Date) {
        return horaValor;
    }
    const raw = String(horaValor || '00:00:00').trim();
    const partes = raw.split(':');
    const hh = String(partes[0] || '00').padStart(2, '0');
    const mm = String(partes[1] || '00').padStart(2, '0');
    const ss = String(partes[2] || '00').padStart(2, '0');
    return new Date(`1970-01-01T${hh}:${mm}:${ss}.000Z`);
}

function evaluarToleranciaReserva(r, horaActualDate) {
    if (r.estadoReserva !== 'PENDIENTE') {
        return { tolerancia_vencida: false, minutos_excedidos: 0 };
    }

    const horaProgDate = normalizarHoraUtcDate(r.horaLlegadaProgramada);
    const limiteMs = horaProgDate.getTime() + TOLERANCIA_MINUTOS * 60 * 1000;
    const diffMs = horaActualDate.getTime() - limiteMs;

    if (diffMs > 0) {
        return {
            tolerancia_vencida: true,
            minutos_excedidos: Math.floor(diffMs / 60000)
        };
    }

    return { tolerancia_vencida: false, minutos_excedidos: 0 };
}

function formatearReserva(r) {
    const horaStr = r.horaLlegadaProgramada instanceof Date
        ? r.horaLlegadaProgramada.toISOString().slice(11, 19)
        : String(r.horaLlegadaProgramada);
    const fechaStr = r.fechaReserva instanceof Date
        ? r.fechaReserva.toISOString().slice(0, 10)
        : String(r.fechaReserva);

    return {
        id_reserva: r.idReserva,
        codigo_alumno: r.codigoAlumno,
        codigo_otp_usado: r.codigoOtpUsado,
        fecha_reserva: fechaStr,
        hora_llegada_programada: horaStr,
        estado_reserva: r.estadoReserva,
        qr_code: r.qrCode || null
    };
}

async function limpiarQrsVencidos() {
    const hoyDate = obtenerFechaHoyLimaDate();
    await prisma.reserva.updateMany({
        where: {
            qrCode: { not: null },
            OR: [
                { fechaReserva: { lt: hoyDate } },
                { estadoReserva: { in: ['CANCELADA', 'EXPIRADA', 'FINALIZADA'] } }
            ]
        },
        data: { qrCode: null }
    });
}

async function buscarReservaActiva(codigoAlumno, fechaReserva) {
    const fechaDate = new Date(`${fechaReserva}T00:00:00.000Z`);
    const reserva = await prisma.reserva.findFirst({
        where: {
            codigoAlumno,
            fechaReserva: fechaDate,
            estadoReserva: 'PENDIENTE'
        },
        select: {
            idReserva: true,
            horaLlegadaProgramada: true,
            estadoReserva: true
        }
    });

    if (!reserva) return null;
    return {
        id_reserva: reserva.idReserva,
        hora_llegada_programada: reserva.horaLlegadaProgramada instanceof Date
            ? reserva.horaLlegadaProgramada.toISOString().slice(11, 19)
            : String(reserva.horaLlegadaProgramada),
        estado_reserva: reserva.estadoReserva
    };
}

async function ejecutarIngresoTransaccional(idReserva) {
    const id = parseInt(idReserva, 10);
    const actualizadas = await prisma.reserva.updateMany({
        where: {
            idReserva: id,
            estadoReserva: 'PENDIENTE'
        },
        data: {
            estadoReserva: 'EN_CURSO'
        }
    });

    if (!actualizadas.count) {
        throw new Error('La reserva ya fue utilizada o no está pendiente.');
    }

    const reserva = await prisma.reserva.findUnique({ where: { idReserva: id } });
    return formatearReserva(reserva);
}

async function ejecutarSalidaPorAlumno(codigoAlumno) {
    const hoyDate = obtenerFechaHoyLimaDate();
    const activa = await prisma.reserva.findFirst({
        where: {
            codigoAlumno,
            fechaReserva: hoyDate,
            estadoReserva: { in: ['EN_CURSO', 'COMPLETADA'] }
        }
    });

    if (!activa) {
        throw new Error(`No se encontró un vehículo dentro del campus para el alumno ${codigoAlumno}.`);
    }

    const actualizada = await prisma.reserva.update({
        where: { idReserva: activa.idReserva },
        data: {
            estadoReserva: 'FINALIZADA',
            qrCode: null
        }
    });

    return formatearReserva(actualizada);
}

async function obtenerMonitorDiarioGarita() {
    const hoyDate = obtenerFechaHoyLimaDate();
    const horaActualDate = obtenerHoraActualLimaDate();

    const reservas = await prisma.reserva.findMany({
        where: {
            fechaReserva: hoyDate,
            estadoReserva: { in: ['PENDIENTE', 'EN_CURSO', 'COMPLETADA'] }
        },
        include: {
            estudiante: {
                select: { nombreCompleto: true }
            }
        },
        orderBy: { horaLlegadaProgramada: 'asc' }
    });

    const ordenadas = reservas.sort((a, b) => {
        const pesoA = ['EN_CURSO', 'COMPLETADA'].includes(a.estadoReserva) ? 1 : 2;
        const pesoB = ['EN_CURSO', 'COMPLETADA'].includes(b.estadoReserva) ? 1 : 2;
        return pesoA - pesoB;
    });

    return ordenadas.map(r => ({
        ...formatearReserva(r),
        nombre_completo: r.estudiante?.nombreCompleto || null,
        ...evaluarToleranciaReserva(r, horaActualDate)
    }));
}

async function penalizarReservaPorGarita(idReserva, motivo, diasPenalizacion = 3) {
    const id = parseInt(idReserva, 10);
    const dias = Number.isInteger(diasPenalizacion) && diasPenalizacion > 0 ? diasPenalizacion : 3;

    return await prisma.$transaction(async (tx) => {
        const reserva = await tx.reserva.findUnique({ where: { idReserva: id } });
        if (!reserva) {
            throw new Error('No se encontró la reserva indicada.');
        }
        if (!reserva.codigoAlumno) {
            throw new Error('La reserva no tiene un código de alumno asociado.');
        }

        const fechaFin = new Date();
        fechaFin.setDate(fechaFin.getDate() + dias);

        if (reserva.estadoReserva === 'PENDIENTE') {
            await tx.reserva.update({
                where: { idReserva: id },
                data: {
                    estadoReserva: 'EXPIRADA',
                    qrCode: null
                }
            });
        }

        return await tx.historialPenalizacion.create({
            data: {
                codigoAlumno: reserva.codigoAlumno,
                motivo,
                fechaFin,
                activa: true
            }
        });
    });
}

async function ejecutarReservaTransaccional(codigoAlumno, codigoOtpUsado, fechaReserva, horaLlegadaProgramada) {
    const fechaDate = new Date(`${fechaReserva}T00:00:00.000Z`);
    const horaDate = normalizarHoraUtcDate(horaLlegadaProgramada);

    const resultado = await prisma.$transaction(async (tx) => {
        const penalizacion = await tx.historialPenalizacion.findFirst({
            where: {
                codigoAlumno,
                activa: true,
                fechaFin: { gte: new Date() }
            }
        });
        if (penalizacion) {
            throw new Error(`No puedes reservar: tienes una suspensión activa por "${penalizacion.motivo}".`);
        }

        const reservaPrevia = await tx.reserva.findFirst({
            where: {
                codigoAlumno,
                fechaReserva: fechaDate
            }
        });

        if (reservaPrevia && ['PENDIENTE', 'EN_CURSO', 'COMPLETADA'].includes(reservaPrevia.estadoReserva)) {
            throw new Error(`Ya cuentas con una reserva activa para el día ${fechaReserva}.`);
        }

        const mesAnio = String(fechaReserva).slice(0, 7);
        let config = await tx.configuracionAforo.findUnique({ where: { mesAnio } });
        if (!config) {
            config = await tx.configuracionAforo.findFirst({ orderBy: { idConfiguracion: 'desc' } });
        }
        const capacidadMensual = config?.capacidadMensual ?? 70;

        const bloqueo = await tx.bloqueoDiario.findUnique({ where: { fecha: fechaDate } });
        const bloqueadosDia = bloqueo?.cuposBloqueados ?? 0;

        const ocupadas = await tx.reserva.count({
            where: {
                fechaReserva: fechaDate,
                estadoReserva: { in: ['PENDIENTE', 'EN_CURSO', 'COMPLETADA'] }
            }
        });

        if (capacidadMensual - bloqueadosDia - ocupadas <= 0) {
            throw new Error('Aforo completo para la fecha seleccionada. No quedan cupos disponibles.');
        }

        let registroReserva;
        if (reservaPrevia && ['CANCELADA', 'EXPIRADA'].includes(reservaPrevia.estadoReserva)) {
            registroReserva = await tx.reserva.update({
                where: { idReserva: reservaPrevia.idReserva },
                data: {
                    codigoOtpUsado,
                    horaLlegadaProgramada: horaDate,
                    estadoReserva: 'PENDIENTE',
                    qrCode: null
                }
            });
        } else {
            registroReserva = await tx.reserva.create({
                data: {
                    codigoAlumno,
                    codigoOtpUsado,
                    fechaReserva: fechaDate,
                    horaLlegadaProgramada: horaDate,
                    estadoReserva: 'PENDIENTE'
                }
            });
        }

        const payloadQR = JSON.stringify({
            idReserva: registroReserva.idReserva,
            codigoAlumno,
            fechaReserva,
            horaLlegadaProgramada
        });
        const qrCodeBase64 = await QRCode.toDataURL(payloadQR, { margin: 2, width: 250 });

        return await tx.reserva.update({
            where: { idReserva: registroReserva.idReserva },
            data: { qrCode: qrCodeBase64 }
        });
    });

    return {
        reserva: formatearReserva(resultado),
        qrCode: resultado.qrCode
    };
}

async function ejecutarCancelacionTransaccional(codigoAlumno, fechaReserva) {
    const fechaDate = new Date(`${fechaReserva}T00:00:00.000Z`);

    await prisma.$transaction(async (tx) => {
        const pendiente = await tx.reserva.findFirst({
            where: {
                codigoAlumno,
                fechaReserva: fechaDate,
                estadoReserva: 'PENDIENTE'
            }
        });

        if (!pendiente) {
            throw new Error('No se encontró ninguna reserva pendiente para cancelar en la fecha seleccionada.');
        }

        await tx.reserva.update({
            where: { idReserva: pendiente.idReserva },
            data: {
                estadoReserva: 'CANCELADA',
                qrCode: null
            }
        });
    });

    return true;
}

async function obtenerReservasPorAlumno(codigoAlumno) {
    await limpiarQrsVencidos();

    const reservas = await prisma.reserva.findMany({
        where: { codigoAlumno },
        orderBy: [
            { fechaReserva: 'desc' },
            { horaLlegadaProgramada: 'desc' }
        ]
    });

    return reservas.map(formatearReserva);
}

async function procesarIngresoEnGarita(codigoAlumno) {
    const ahora = new Date();
    const limaStr = ahora.toLocaleDateString('en-CA', { timeZone: 'America/Lima' });
    const fechaHoyUTC = new Date(`${limaStr}T00:00:00.000Z`);
    const horaActualDate = obtenerHoraActualLimaDate();

    return await prisma.$transaction(async (tx) => {
        const reserva = await tx.reserva.findFirst({
            where: {
                codigoAlumno,
                fechaReserva: fechaHoyUTC,
                estadoReserva: 'PENDIENTE'
            }
        });

        if (!reserva) {
            throw {
                status: 400,
                message: `No se localizó una reserva PENDIENTE para el alumno ${codigoAlumno} hoy (${limaStr}).`
            };
        }

        const horaProgDate = normalizarHoraUtcDate(reserva.horaLlegadaProgramada);
        const horaProgramadaStr = horaProgDate.toISOString().slice(11, 19);
        const limiteToleranciaMs = horaProgDate.getTime() + TOLERANCIA_MINUTOS * 60 * 1000;

        if (horaActualDate.getTime() > limiteToleranciaMs) {
            await tx.reserva.update({
                where: { idReserva: reserva.idReserva },
                data: {
                    estadoReserva: 'EXPIRADA',
                    qrCode: null
                }
            });

            throw {
                status: 403,
                message: `Acceso denegado: excediste los ${TOLERANCIA_MINUTOS} minutos de tolerancia (hora programada: ${horaProgramadaStr}). Reserva marcada como expirada; pendiente de revisión en garita.`
            };
        }

        await tx.reserva.update({
            where: { idReserva: reserva.idReserva },
            data: { estadoReserva: 'EN_CURSO' }
        });

        return {
            mensaje: `Ingreso validado para ${codigoAlumno}. (+1 vehículo en planta)`
        };
    });
}

module.exports = {
    buscarReservaActiva,
    ejecutarIngresoTransaccional,
    ejecutarSalidaPorAlumno,
    obtenerMonitorDiarioGarita,
    penalizarReservaPorGarita,
    ejecutarReservaTransaccional,
    ejecutarCancelacionTransaccional,
    obtenerReservasPorAlumno,
    procesarIngresoEnGarita
};