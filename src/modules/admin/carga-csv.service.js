const prisma = require('../../config/prisma');

function evaluarElegibilidadYPrioridad(pensionesTexto, estadoTexto, meritoTexto, promedio, asistencia) {
    const estaAlDiaPagos = ['true', '1', 'si', 'sí'].includes(pensionesTexto.toLowerCase());
    const estaActivo = estadoTexto.toUpperCase() === 'ACTIVO';
    const esAptoParking = estaActivo && estaAlDiaPagos;

    const meritoNormalizado = meritoTexto.toLowerCase();
    let nivelPrioridad = 'ESTANDAR';
    if (meritoNormalizado.includes('quinto')) {
        nivelPrioridad = 'ALTA_QUINTO';
    } else if (meritoNormalizado.includes('tercio') || (promedio >= 14.0 && asistencia >= 70.0)) {
        nivelPrioridad = 'MEDIA_TERCIO';
    }

    return { estaAlDiaPagos, esAptoParking, nivelPrioridad };
}

async function procesarPadronCsv(bufferArchivo) {
    const contenido = bufferArchivo.toString('utf-8');
    const lineas = contenido.split(/\r?\n/).map(linea => linea.trim()).filter(Boolean);

    if (lineas.length < 2) {
        throw new Error('El archivo CSV está vacío o no contiene registros de estudiantes.');
    }

    const separador = lineas[0].includes(';') ? ';' : ',';
    let totalProcesados = 0;
    let totalAptos = 0;
    let prioridadAlta = 0;
    let prioridadMedia = 0;
    let prioridadEstandar = 0;

    for (let i = 1; i < lineas.length; i++) {
        const columnas = lineas[i].split(separador).map(col => col.trim());
        if (columnas.length < 10) continue;

        const [
            codigoRaw,
            _dni,
            nombresApellidos,
            correoRaw,
            _celular,
            promedioStr,
            asistenciaStr,
            perteneceMerito,
            pensionesStr,
            estadoStr
        ] = columnas;

        const codigoAlumno = codigoRaw.toUpperCase();
        const correoInstitucional = correoRaw.toLowerCase();
        const promedioPonderado = parseFloat(promedioStr);
        const porcentajeAsistencia = parseFloat(asistenciaStr);

        if (Number.isNaN(promedioPonderado) || Number.isNaN(porcentajeAsistencia)) {
            continue;
        }

        const { estaAlDiaPagos, esAptoParking, nivelPrioridad } = evaluarElegibilidadYPrioridad(
            pensionesStr,
            estadoStr,
            perteneceMerito,
            promedioPonderado,
            porcentajeAsistencia
        );

        if (esAptoParking) {
            totalAptos++;
            if (nivelPrioridad === 'ALTA_QUINTO') prioridadAlta++;
            else if (nivelPrioridad === 'MEDIA_TERCIO') prioridadMedia++;
            else prioridadEstandar++;
        }

        await prisma.estudianteHabilitado.upsert({
            where: { codigoAlumno },
            update: {
                correoInstitucional,
                nombreCompleto: nombresApellidos,
                perteneceMerito,
                promedioPonderado,
                porcentajeAsistencia,
                estaAlDiaPagos,
                esAptoParking
            },
            create: {
                codigoAlumno,
                correoInstitucional,
                nombreCompleto: nombresApellidos,
                perteneceMerito,
                promedioPonderado,
                porcentajeAsistencia,
                estaAlDiaPagos,
                esAptoParking
            }
        });

        totalProcesados++;
    }

    return {
        totalProcesados,
        totalAptos,
        noAptosPorDeudaOEstado: totalProcesados - totalAptos,
        distribucionPrioridad: {
            altaQuintoSuperior: prioridadAlta,
            mediaTercioSuperior: prioridadMedia,
            estandar: prioridadEstandar
        }
    };
}

module.exports = { procesarPadronCsv };