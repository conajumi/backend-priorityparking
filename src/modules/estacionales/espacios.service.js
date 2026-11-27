const prisma = require('../../config/prisma');

async function obtenerTodosLosEspacios() {
    const espacios = await prisma.espacioEstacionamiento.findMany({
        select: {
            idEspacio: true,
            piso: true,
            numeroSlot: true,
            estado: true,
            tipoVehiculo: true
        },
        orderBy: [
            { piso: 'asc' },
            { numeroSlot: 'asc' }
        ]
    });

    return espacios.map(e => ({
        id_espacio: e.idEspacio,
        piso: e.piso,
        numero_slot: e.numeroSlot,
        estado: e.estado,
        tipo_vehiculo: e.tipoVehiculo
    }));
}

async function obtenerEspaciosPorPiso(piso) {
    const espacios = await prisma.espacioEstacionamiento.findMany({
        where: {
            piso: parseInt(piso, 10)
        },
        select: {
            idEspacio: true,
            piso: true,
            numeroSlot: true,
            estado: true,
            tipoVehiculo: true
        },
        orderBy: {
            numeroSlot: 'asc'
        }
    });

    return espacios.map(e => ({
        id_espacio: e.idEspacio,
        piso: e.piso,
        numero_slot: e.numeroSlot,
        estado: e.estado,
        tipo_vehiculo: e.tipoVehiculo
    }));
}

async function modificarEstadoFisico(idEspacio, nuevoEstado) {
    const actualizado = await prisma.espacioEstacionamiento.update({
        where: {
            idEspacio
        },
        data: {
            estado: nuevoEstado.toUpperCase()
        }
    });

    return {
        id_espacio: actualizado.idEspacio,
        piso: actualizado.piso,
        numero_slot: actualizado.numeroSlot,
        estado: actualizado.estado,
        tipo_vehiculo: actualizado.tipoVehiculo
    };
}

module.exports = {
    obtenerTodosLosEspacios,
    obtenerEspaciosPorPiso,
    modificarEstadoFisico
};