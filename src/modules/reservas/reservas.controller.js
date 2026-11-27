const reservasService = require('./reservas.service');

async function registrarIngresoVehiculo(req, res) {
    const codigoAlumnoLimpio = req.body.codigo_alumno || req.body.codigoAlumno;

    if (!codigoAlumnoLimpio) {
        return res.status(400).json({ error: 'Debe ingresar el código de alumno o escanear el QR.' });
    }

    try {
        const parametroAlumno = String(codigoAlumnoLimpio).trim().toUpperCase();
        const resultado = await reservasService.procesarIngresoEnGarita(parametroAlumno);
        return res.status(200).json(resultado);
    } catch (error) {
        if (error.status) {
            return res.status(error.status).json({ error: error.message });
        }
        console.error('[Garita] ERROR:', error.message);
        return res.status(500).json({ error: 'Fallo interno al procesar el ingreso vehicular en garita.' });
    }
}

async function registrarSalidaVehiculo(req, res) {
    const codigoAlumno = req.body.codigo_alumno || req.body.codigoAlumno;

    if (!codigoAlumno) {
        return res.status(400).json({ error: 'Falta el parámetro requerido (codigo_alumno).' });
    }

    try {
        const parametroAlumno = String(codigoAlumno).trim().toUpperCase();
        await reservasService.ejecutarSalidaPorAlumno(parametroAlumno);

        return res.status(200).json({
            mensaje: `Salida procesada para ${parametroAlumno}. (-1 vehículo en planta, cupo liberado)`
        });
    } catch (error) {
        console.error('[Reservas Controller Error - Salida]:', error.message);
        return res.status(400).json({ error: error.message || 'Fallo interno al procesar la salida vehicular.' });
    }
}

async function obtenerEspaciosGarita(req, res) {
    try {
        const movimientos = await reservasService.obtenerMonitorDiarioGarita();
        return res.status(200).json(movimientos);
    } catch (error) {
        console.error('[Reservas Controller Error]:', error.message);
        return res.status(500).json({ error: 'Fallo interno al obtener el monitor diario.' });
    }
}

async function crearReservaAlumno(req, res) {
    const { codigo_alumno, otp_verificado, fecha_reserva, hora_llegada } = req.body;

    if (!codigo_alumno || !fecha_reserva || !hora_llegada) {
        return res.status(400).json({
            error: 'Faltan parámetros obligatorios (codigo_alumno, fecha_reserva, hora_llegada).'
        });
    }

    try {
        const resultado = await reservasService.ejecutarReservaTransaccional(
            String(codigo_alumno).trim().toUpperCase(),
            otp_verificado || '000000',
            fecha_reserva,
            hora_llegada
        );

        return res.status(200).json({
            success: true,
            mensaje: `Cupo reservado con éxito para el día ${fecha_reserva} a las ${hora_llegada}. Tienes 20 min de tolerancia.`,
            reserva: resultado.reserva,
            qrCode: resultado.qrCode
        });
    } catch (error) {
        console.error('[Reservas Controller Error]:', error.message);
        if (error.message.includes('unique_reserva_por_dia_alumno') || error.code === '23505') {
            return res.status(400).json({ error: `Ya cuentas con una reserva registrada para el día ${fecha_reserva}.` });
        }
        return res.status(400).json({ error: error.message || 'Fallo interno al procesar la reserva.' });
    }
}

async function cancelarReservaAlumno(req, res) {
    const { codigo_alumno, fecha_reserva } = req.body;

    if (!codigo_alumno || !fecha_reserva) {
        return res.status(400).json({ error: 'Faltan parámetros obligatorios (codigo_alumno, fecha_reserva).' });
    }

    try {
        await reservasService.ejecutarCancelacionTransaccional(
            String(codigo_alumno).trim().toUpperCase(),
            fecha_reserva
        );

        return res.status(200).json({
            mensaje: `Reserva para el día ${fecha_reserva} cancelada con éxito. El cupo vuelve al aforo disponible.`
        });
    } catch (error) {
        console.error('[Cancelación Controller Error]:', error.message);
        return res.status(400).json({ error: error.message || 'Fallo interno al procesar la cancelación.' });
    }
}

async function listarMisReservas(req, res) {
    try {
        const codigoAlumno = req.query.codigoAlumno || req.usuario?.codigoAlumno || req.body?.codigo_alumno;

        if (!codigoAlumno) {
            return res.status(400).json({ error: 'Falta el parámetro obligatorio: codigoAlumno.' });
        }

        const reservas = await reservasService.obtenerReservasPorAlumno(String(codigoAlumno).trim().toUpperCase());
        return res.status(200).json(reservas);
    } catch (error) {
        console.error('[Reservas Controller Error - listarMisReservas]:', error.message);
        return res.status(500).json({ error: 'Fallo interno al consultar el listado de reservas.' });
    }
}

module.exports = {
    registrarIngresoVehiculo,
    registrarSalidaVehiculo,
    obtenerEspaciosGarita,
    crearReservaAlumno,
    cancelarReservaAlumno,
    listarMisReservas
};