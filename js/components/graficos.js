// Gráficos (Chart.js) com a paleta do sistema
export const CORES = ['#2e5a3d', '#8fa046', '#c9a43a', '#4f8a8b', '#7b5e3b', '#9bb59f', '#5f6f2f', '#b5654a', '#3d4f7a', '#a3a89a'];
const ativos = new Map();

export function grafico(canvas, config) {
  if (!window.Chart || !canvas) return null;
  ativos.get(canvas)?.destroy();
  const Chart = window.Chart;
  Chart.defaults.font.family = getComputedStyle(document.body).fontFamily;
  Chart.defaults.color = '#56615a';
  Chart.defaults.borderColor = '#e7e9e3';
  const opcoes = {
    responsive: true,
    maintainAspectRatio: false,
    locale: 'pt-BR',
    plugins: {
      legend: { display: config.type === 'doughnut', position: 'bottom', labels: { boxWidth: 12, boxHeight: 12, padding: 12 } },
      tooltip: { backgroundColor: '#1b3524', padding: 10, cornerRadius: 6 },
    },
    scales: config.type === 'doughnut' ? undefined : {
      x: { grid: { display: false } },
      y: { beginAtZero: config.beginAtZero !== false, ticks: { precision: 0 } },
    },
    ...config.options,
  };
  if (config.type === 'bar') config.data.datasets.forEach((d) => { d.maxBarThickness ??= 36; });
  const g = new Chart(canvas, { type: config.type, data: config.data, options: opcoes });
  ativos.set(canvas, g);
  return g;
}

export const semDados = (msg = 'Ainda não há dados suficientes para este gráfico.') => `<div class="grafico-vazio">${msg}</div>`;
