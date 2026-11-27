const prisma = require('../../config/prisma');
const bcrypt = require('bcrypt');

async function crearOperadorGarita({ username, password, nombreCompleto }) {
    const usernameNormalizado = username.trim().toUpperCase();

    const existe = await prisma.usuarioSistema.findUnique({
        where: { username: usernameNormalizado }
    });

    if (existe) {
        throw new Error(`El usuario '${usernameNormalizado}' ya se encuentra registrado.`);
    }

    const passwordHash = await bcrypt.hash(password, 10);

    return await prisma.usuarioSistema.create({
        data: {
            username: usernameNormalizado,
            passwordHash,
            rol: 'GARITA',
            nombreCompleto: nombreCompleto.trim(),
            activo: true
        },
        select: {
            idUsuario: true,
            username: true,
            rol: true,
            nombreCompleto: true,
            activo: true
        }
    });
}

async function listarOperadoresGarita() {
    return await prisma.usuarioSistema.findMany({
        where: { rol: 'GARITA' },
        select: {
            idUsuario: true,
            username: true,
            nombreCompleto: true,
            activo: true,
            fechaCreacion: true
        },
        orderBy: { fechaCreacion: 'desc' }
    });
}

module.exports = { crearOperadorGarita, listarOperadoresGarita };