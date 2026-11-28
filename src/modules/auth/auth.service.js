const prisma = require('../../config/prisma');
const bcrypt = require('bcrypt');

const OTP_VIGENCIA_MINUTOS = 3;
const OTP_PERMANENCIA_HORAS = 1;

async function buscarEstudiantePorCorreo(correo) {
    return await prisma.estudianteHabilitado.findUnique({
        where: { correoInstitucional: correo }
    });
}

async function limpiarOtpsExpirados() {
    const limitePermanencia = new Date(Date.now() - OTP_PERMANENCIA_HORAS * 60 * 60 * 1000);
    const resultado = await prisma.registroOtp.deleteMany({
        where: {
            fechaGeneracion: { lt: limitePermanencia }
        }
    });
    return resultado.count;
}

async function registrarLogOtp(codigoAlumno, codigoOtp) {
    await limpiarOtpsExpirados();

    // Marca como expirados los OTP anteriores pendientes de este alumno sin borrarlos aún
    await prisma.registroOtp.updateMany({
        where: { codigoAlumno, expirado: false },
        data: { expirado: true }
    });

    await prisma.registroOtp.create({
        data: {
            codigoAlumno,
            codigoOtp,
            expirado: false
        }
    });

    console.log(`[Database] OTP '${codigoOtp}' registrado (vigencia ${OTP_VIGENCIA_MINUTOS} min, retención ${OTP_PERMANENCIA_HORAS} h) para: ${codigoAlumno}`);
    return true;
}

async function validarCodigoOtp(codigoAlumno, otpIngresado) {
    const limiteVigencia = new Date(Date.now() - OTP_VIGENCIA_MINUTOS * 60 * 1000);

    const registro = await prisma.registroOtp.findFirst({
        where: {
            codigoAlumno,
            expirado: false,
            fechaGeneracion: { gte: limiteVigencia }
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
    limpiarOtpsExpirados,
    registrarLogOtp,
    validarCodigoOtp,
    validarUsuarioSistema,
    verificarEstudiantePenalizado
};