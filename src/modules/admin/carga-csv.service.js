const prisma = require('../../config/prisma');
const { calcularPuntajePrioridad } = require('./prioridad.service');

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

        const estaAlDiaPagos = ['true', '1', 'si', 'sí'].includes(String(pensionesStr || '').trim().toLowerCase());
        const estaActivo = String(estadoStr || '').trim().toUpperCase() === 'ACTIVO';
        const esApto = estaActivo && estaAlDiaPagos;

        if (esApto) {
            totalAptos++;
            const { nivelPrioridad } = calcularPuntajePrioridad({
                perteneceMerito,
                promedioPonderado,
                porcentajeAsistencia
            });

            if (nivelPrioridad === 'ALTA') prioridadAlta++;
            else if (nivelPrioridad === 'MEDIA') prioridadMedia++;
            else prioridadEstandar++;
        }

        // es_apto_parking es columna generada en PostgreSQL; no se envía en update ni create
        await prisma.estudianteHabilitado.upsert({
            where: { codigoAlumno },
            update: {
                correoInstitucional,
                nombreCompleto: nombresApellidos,
                perteneceMerito,
                promedioPonderado,
                porcentajeAsistencia,
                estaAlDiaPagos
            },
            create: {
                codigoAlumno,
                correoInstitucional,
                nombreCompleto: nombresApellidos,
                perteneceMerito,
                promedioPonderado,
                porcentajeAsistencia,
                estaAlDiaPagos
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