const prisma = require('../../config/prisma');
const garitaService = require('./garita.service');
const cargaCsvService = require('./carga-csv.service');
const aforoService = require('./aforo.service');
const { calcularPuntajePrioridad } = require('./prioridad.service');

async function registrarGarita(req, res) {
    const { username, password, nombreCompleto } = req.body;

    if (!username || !password || !nombreCompleto) {
        return res.status(400).json({
            error: 'Faltan campos obligatorios (username, password, nombreCompleto).'
        });
    }

    const userLimpio = String(username).trim().toUpperCase();
    const nombreLimpio = String(nombreCompleto).trim();

    if (!/^[A-Z0-9_-]{4,25}$/.test(userLimpio)) {
        return res.status(400).json({
            error: 'El usuario debe tener entre 4 y 25 caracteres (letras, números, guion o guion bajo).'
        });
    }

    const regexSegura = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/;
    if (!regexSegura.test(password)) {
        return res.status(400).json({
            error: 'La contraseña debe tener mínimo 8 caracteres, mayúscula, minúscula, número y un símbolo especial.'
        });
    }

    const passLower = password.toLowerCase();
    const palabrasNombre = nombreLimpio.toLowerCase().split(/\s+/).filter(p => p.length >= 3);
    if (passLower.includes(userLimpio.toLowerCase()) || palabrasNombre.some(p => passLower.includes(p))) {
        return res.status(400).json({
            error: 'Por seguridad, la contraseña no puede contener el usuario ni el nombre del operador.'
        });
    }

    try {
        const nuevoOperador = await garitaService.crearOperadorGarita({
            username: userLimpio,
            password,
            nombreCompleto: nombreLimpio
        });

        return res.status(201).json({
            mensaje: `Operador ${userLimpio} creado con contraseña segura.`,
            operador: nuevoOperador
        });
    } catch (error) {
        const status = error.message.includes('ya se encuentra') ? 409 : 500;
        return res.status(status).json({ error: error.message });
    }
}

async function obtenerGaritas(req, res) {
    try {
        const lista = await garitaService.listarOperadoresGarita();
        return res.status(200).json(lista);
    } catch (error) {
        console.error('[Admin Controller Error - Garitas]:', error.message);
        return res.status(500).json({ error: 'Error al consultar los operadores de Garita.' });
    }
}

async function subirPadronAlumnos(req, res) {
    if (!req.file) {
        return res.status(400).json({ error: 'Debe adjuntar un archivo .csv válido en el campo archivoCsv.' });
    }

    try {
        const resumen = await cargaCsvService.procesarPadronCsv(req.file.buffer);
        return res.status(200).json({
            mensaje: 'Padrón académico procesado correctamente.',
            resumen
        });
    } catch (error) {
        console.error('[Admin Controller Error - CSV]:', error.message);
        return res.status(400).json({ error: error.message });
    }
}

async function obtenerAforo(req, res) {
    try {
        const [estado, estudiantes] = await Promise.all([
            aforoService.obtenerEstadoAforoHoy(),
            prisma.estudianteHabilitado.findMany({
                select: {
                    estaAlDiaPagos: true,
                    esAptoParking: true,
                    perteneceMerito: true,
                    promedioPonderado: true,
                    porcentajeAsistencia: true
                }
            })
        ]);

        let totalAptos = 0;
        let altaQuintoSuperior = 0;
        let mediaTercioSuperior = 0;
        let estandar = 0;

        for (const est of estudiantes) {
            const apto = Boolean(est.esAptoParking ?? est.estaAlDiaPagos);
            if (!apto) continue;
            totalAptos++;

            const { nivelPrioridad } = calcularPuntajePrioridad({
                perteneceMerito: est.perteneceMerito,
                promedioPonderado: est.promedioPonderado,
                porcentajeAsistencia: est.porcentajeAsistencia
            });

            if (nivelPrioridad === 'ALTA') altaQuintoSuperior++;
            else if (nivelPrioridad === 'MEDIA') mediaTercioSuperior++;
            else estandar++;
        }

        return res.status(200).json({
            ...estado,
            resumenPadronBd: {
                totalProcesados: estudiantes.length,
                totalAptos,
                noAptosPorDeudaOEstado: estudiantes.length - totalAptos,
                distribucionPrioridad: {
                    altaQuintoSuperior,
                    mediaTercioSuperior,
                    estandar
                }
            }
        });
    } catch (error) {
        console.error('[Admin Controller Error - Aforo]:', error.message);
        return res.status(500).json({ error: 'Error al obtener el estado del aforo.' });
    }
}

async function configurarAforoMensual(req, res) {
    const { mesAnio, capacidadMensual } = req.body;

    if (capacidadMensual === undefined || capacidadMensual === null) {
        return res.status(400).json({ error: 'Debe indicar la capacidadMensual.' });
    }

    try {
        const adminUsername = req.usuario?.codigo || 'UTP-ADMIN';
        const config = await aforoService.actualizarAforoMensual({
            mesAnio,
            capacidadMensual,
            adminUsername
        });

        return res.status(200).json({
            mensaje: `Aforo mensual actualizado a ${config.capacidadMensual} espacios.`,
            configuracion: config
        });
    } catch (error) {
        return res.status(400).json({ error: error.message });
    }
}

async function registrarBloqueoGarita(req, res) {
    const { cuposBloqueados, motivo } = req.body;

    if (cuposBloqueados === undefined || cuposBloqueados === null) {
        return res.status(400).json({ error: 'Debe indicar la cantidad de cuposBloqueados.' });
    }

    try {
        const garitaUsername = req.usuario?.codigo || 'UTP-GARITA';
        const bloqueo = await aforoService.registrarBloqueoDiario({
            cuposBloqueados,
            motivo,
            garitaUsername
        });

        return res.status(200).json({
            mensaje: `Bloqueo operativo del día actualizado (${bloqueo.cuposBloqueados} cupos).`,
            bloqueo
        });
    } catch (error) {
        return res.status(400).json({ error: error.message });
    }
}

module.exports = {
    registrarGarita,
    obtenerGaritas,
    subirPadronAlumnos,
    obtenerAforo,
    configurarAforoMensual,
    registrarBloqueoGarita
};