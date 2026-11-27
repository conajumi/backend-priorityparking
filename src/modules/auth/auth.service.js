const prisma = require('../../config/prisma');
const bcrypt = require('bcrypt');

async function buscarEstudiantePorCorreo(correo) {
    return await prisma.estudianteHabilitado.findUnique({
        where: { correoInstitucional: correo }
    });
}

async function registrarLogOtp(codigoAlumno, codigoOtp) {
    await prisma.registroOtp.deleteMany({
        where: { codigoAlumno }
    });

    await prisma.registroOtp.create({
        data: {
            codigoAlumno,
            codigoOtp,
            expirado: false
        }
    });

    console.log(`[Database] OTP '${codigoOtp}' registrado para el alumno: ${codigoAlumno}`);
    return true;
}

async function validarCodigoOtp(codigoAlumno, otpIngresado) {
    const cincoMinutosAtras = new Date(Date.now() - 5 * 60 * 1000);

    const registro = await prisma.registroOtp.findFirst({
        where: {
            codigoAlumno,
            expirado: false,
            fechaGeneracion: { gte: cincoMinutosAtras }
        },
        orderBy: { fechaGeneracion: 'desc' }
    });

    if (!registro) return false;

    if (registro.codigoOtp === otpIngresado) {
        await prisma.registroOtp.update({
            where: { idOtp: registro.idOtp },
            data: { expirado: true }
        });
        return true;
    }
    return false;
}

async function validarUsuarioSistema(username, passwordPlano) {
    const usuario = await prisma.usuarioSistema.findUnique({
        where: { username }
    });

    if (!usuario || !usuario.activo) {
        return null;
    }

    const coincide = await bcrypt.compare(passwordPlano, usuario.passwordHash);
    if (!coincide) {
        return null;
    }

    return {
        username: usuario.username,
        rol: usuario.rol,
        nombreCompleto: usuario.nombreCompleto
    };
}

async function verificarEstudiantePenalizado(codigoAlumno) {
    const penalizacion = await prisma.historialPenalizacion.findFirst({
        where: {
            codigoAlumno,
            activa: true,
            fechaFin: { gte: new Date() }
        }
    });

    if (penalizacion) {
        return {
            isPenalized: true,
            motivo: penalizacion.motivo,
            fechaFin: penalizacion.fechaFin
        };
    }

    return { isPenalized: false };
}

module.exports = {
    buscarEstudiantePorCorreo,
    registrarLogOtp,
    validarCodigoOtp,
    validarUsuarioSistema,
    verificarEstudiantePenalizado
};