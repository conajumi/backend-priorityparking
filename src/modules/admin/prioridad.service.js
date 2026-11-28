/**
 * Calcula el puntaje de prioridad (0 a 100) de forma aditiva por parámetro:
 * - Mérito académico: Quinto superior (+35), Tercio superior (+20), otro (+0)
 * - Promedio ponderado (0 a 20): hasta +35 pts
 * - Porcentaje de asistencia (0 a 100): hasta +30 pts
 * - Penalizaciones acumuladas: -10 pts por penalización (piso en 0)
 */
function calcularPuntajePrioridad({
    perteneceMerito = '-',
    promedioPonderado = 0,
    porcentajeAsistencia = 0,
    totalPenalizaciones = 0
}) {
    const meritoNorm = String(perteneceMerito || '-').trim().toLowerCase();

    let puntosMerito = 0;
    if (meritoNorm.includes('quinto')) {
        puntosMerito = 35;
    } else if (meritoNorm.includes('tercio')) {
        puntosMerito = 20;
    }

    const promedio = Math.max(0, Math.min(20, Number(promedioPonderado) || 0));
    const asistencia = Math.max(0, Math.min(100, Number(porcentajeAsistencia) || 0));
    const penalizaciones = Math.max(0, parseInt(totalPenalizaciones, 10) || 0);

    const puntosPromedio = Number(((promedio / 20) * 35).toFixed(2));
    const puntosAsistencia = Number(((asistencia / 100) * 30).toFixed(2));
    const descuentoPenalizaciones = penalizaciones * 10;

    const puntajeBruto = puntosMerito + puntosPromedio + puntosAsistencia - descuentoPenalizaciones;
    const puntajeTotal = Math.max(0, Math.min(100, Number(puntajeBruto.toFixed(2))));

    let nivelPrioridad = 'ESTANDAR';
    let etiquetaPrioridad = 'Estándar';

    if (puntajeTotal >= 75) {
        nivelPrioridad = 'ALTA';
        etiquetaPrioridad = 'Alta';
    } else if (puntajeTotal >= 50) {
        nivelPrioridad = 'MEDIA';
        etiquetaPrioridad = 'Media';
    }

    return {
        puntajeTotal,
        nivelPrioridad,
        etiquetaPrioridad,
        desglose: {
            puntosMerito,
            puntosPromedio,
            puntosAsistencia,
            descuentoPenalizaciones
        }
    };
}

module.exports = { calcularPuntajePrioridad };