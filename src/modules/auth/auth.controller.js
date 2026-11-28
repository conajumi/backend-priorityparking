// src/modules/auth/auth.controller.js
const jwt = require('jsonwebtoken');
const authService = require('./auth.service');

/**
 * PASO 1: Solicitar Código OTP (Módulo de Autenticación Blindado)
 */
async function solicitarOtp(req, res) {
    const { correo } = req.body;

    try {
        const regexUtp = /^[a-zA-Z0-9._%+-]+@utp\.edu\.pe$/;
        if (!regexUtp.test(correo)) {
            return res.status(400).json({
                error: 'Acceso denegado. Debe ingresar un correo institucional válido de la UTP (@utp.edu.pe).'
            });
        }

        const resultadoBD = await authService.buscarEstudiantePorCorreo(correo);
        const estudiante = Array.isArray(resultadoBD) ? resultadoBD[0] : resultadoBD;

        if (!estudiante) {
            return res.status(404).json({
                error: 'El estudiante no se encuentra registrado en el sistema institucional actual.'
            });
        }

        if (!estudiante.esAptoParking) {
            let motivosRechazo = [];
            if (!estudiante.estaAlDiaPagos) {
                motivosRechazo.push('Presentas deudas pendientes en tus cuotas académicas.');
            }
            if (parseFloat(estudiante.porcentajeAsistencia) < 70.00) {
                motivosRechazo.push(`Tu asistencia actual es de ${estudiante.porcentajeAsistencia}%, siendo el mínimo requerido 70%.`);
            }
            if (parseFloat(estudiante.promedioPonderado) < 14.00) {
                motivosRechazo.push(`Tu promedio ponderado es de ${estudiante.promedioPonderado}, siendo la nota mínima requerida 14.00.`);
            }

            return res.status(403).json({
                error: `Acceso Denegado PriorityParking: No cumples con los requisitos del día de hoy debido a: ${motivosRechazo.join(' y ')}`
            });
        }

        const codigoOtp = '000000';
        await authService.registrarLogOtp(estudiante.codigoAlumno, codigoOtp);
        console.log(`\n📬 [Seguridad MVP] Código OTP generado para ${correo}: ${codigoOtp}\n`);

        return res.status(200).json({
            mensaje: 'Código de verificación generado exitosamente.',
            codigoAlumno: estudiante.codigoAlumno
        });
    } catch (error) {
        console.error('[Auth Controller Error Critical]:', error.message);
        return res.status(500).json({ error: 'Error interno del servidor al procesar la solicitud de acceso.' });
    }
}

/**
 * PASO 2: Verificar Código OTP (Estudiantes) o Credenciales de Sistema (Admin/Garita)
 */
async function verificarOtp(req, res) {
    const { codigoAlumno, otp } = req.body;

    if (!codigoAlumno || !otp) {
        return res.status(400).json({ error: 'Faltan parámetros requeridos.' });
    }

    try {
        let esValido = false;
        let rolUsuario = 'ESTUDIANTE';

        // 1. Validar si es un operador del sistema (ADMIN o GARITA) en PostgreSQL con bcrypt
        const usuarioSistema = await authService.validarUsuarioSistema(codigoAlumno, otp);

        if (usuarioSistema) {
            esValido = true;
            rolUsuario = usuarioSistema.rol;
        } else {
            // 2. Validar como código OTP de Estudiante
            esValido = await authService.validarCodigoOtp(codigoAlumno, otp);
        }

        if (!esValido) {
            return res.status(401).json({ error: 'Credenciales o código de verificación incorrectos.' });
        }

        console.log(`🔑 [Seguridad MVP] Acceso AUTORIZADO para el rol: ${rolUsuario} (${codigoAlumno}).`);

        const payload = {
            codigo: codigoAlumno,
            rol: rolUsuario,
            sede: 'LIMA_CENTRO'
        };

        const claveSecreta = process.env.JWT_SECRET;
        if (!claveSecreta) {
            throw new Error('JWT_SECRET no configurado en variables de entorno.');
        }

        const tokenJwt = jwt.sign(payload, claveSecreta, { expiresIn: '2h' });

        return res.status(200).json({
            mensaje: 'Autenticación exitosa. Bienvenido a PriorityParking.',
            autorizado: true,
            token: tokenJwt,
            rol: rolUsuario
        });
    } catch (error) {
        console.error('[Auth Controller Error Real]:', error.message);
        return res.status(500).json({ error: 'Error interno del servidor al verificar el acceso.' });
    }
}

module.exports = {
    solicitarOtp,
    verificarOtp
};