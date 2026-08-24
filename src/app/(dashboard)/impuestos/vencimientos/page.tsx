import { createAdminClient } from "@/lib/supabase/admin";
import { getMesTrabajoActual, MESES_NOMBRES } from "@/lib/vencimientos";
import clsx from "clsx";
import { MesSelector } from "@/components/MesSelector";

// Vencimientos aproximados por subtipo (día del mes siguiente)
// Estos son genéricos — cada cliente puede tener fechas distintas
const VTO_DIA: Record<string, number> = {
  iva: 20,
  iibb: 15,
  seh: 10,
};

const SUBTIPO_LABEL: Record<string, string> = {
  iva: "IVA",
  iibb: "IIBB",
  seh: "Seg. e Hig.",
};

function vtoMes(mes: number, anio: number, dia: number): Date {
  // Vencimiento = día del mes SIGUIENTE al mes declarado
  const m = mes === 12 ? 1 : mes + 1;
  const a = mes === 12 ? anio + 1 : anio;
  return new Date(a, m - 1, dia);
}

function generarOpciones(mesActual: number, anioActual: number) {
  const result = [];
  let m = mesActual;
  let a = anioActual;
  for (let i = 0; i < 14; i++) {
    result.push({ mes: m, anio: a });
    m--;
    if (m === 0) { m = 12; a--; }
  }
  return result;
}

export default async function ImpuestosVencimientosPage({
  searchParams,
}: {
  searchParams: { mes?: string; anio?: string };
}) {
  const { mes: mesDefault, anio: anioDefault } = getMesTrabajoActual();
  const mes = Number(searchParams.mes) || mesDefault;
  const anio = Number(searchParams.anio) || anioDefault;

  const admin = createAdminClient();
  const hoy = new Date();
  const opciones = generarOpciones(mesDefault, anioDefault);

  const [{ data: serviciosRaw }, { data: tareasRaw }] = await Promise.all([
    admin
      .from("servicios_cliente")
      .select("cliente_id, subtipo, responsable_id, clientes(nombre)")
      .eq("servicio", "impuestos")
      .eq("estado", true),
    admin
      .from("impuestos_tareas")
      .select("cliente_id, subtipo, estado, fecha_presentacion, pago_estado")
      .eq("anio", anio)
      .eq("mes", mes),
  ]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const servicios = (serviciosRaw as any[]) ?? [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tareas = (tareasRaw as any[]) ?? [];
  const tareasMap = new Map(tareas.map((t) => [`${t.cliente_id}:${t.subtipo}`, t]));

  // Agrupar pendientes por subtipo
  const pendientesPorSubtipo = ["iva", "iibb", "seh"].map((subtipo) => {
    const srvs = servicios.filter((s) => s.subtipo === subtipo);
    const pendientes = srvs.filter((s) => {
      const t = tareasMap.get(`${s.cliente_id}:${subtipo}`);
      return !t || t.estado !== "presentado";
    });
    const vto = vtoMes(mes, anio, VTO_DIA[subtipo]);
    const dias = Math.ceil((vto.getTime() - hoy.getTime()) / 86400000);
    return { subtipo, label: SUBTIPO_LABEL[subtipo], pendientes, total: srvs.length, vto, dias };
  });

  return (
    <div className="flex-1 overflow-y-auto p-6 bg-gray-50">
      {/* Header */}
      <div className="flex items-center justify-between mb-2 flex-wrap gap-3">
        <div>
          <p className="text-xs text-gray-400 font-medium uppercase tracking-widest mb-1">Impuestos</p>
          <h1 className="text-[20px] font-semibold text-gray-900">
            Vencimientos — {MESES_NOMBRES[mes]} {anio}
          </h1>
        </div>
        <MesSelector basePath="/impuestos/vencimientos" options={opciones} currentMes={mes} currentAnio={anio} />
      </div>
      <p className="text-[12px] text-gray-400 mb-6">
        Fechas indicativas — día {VTO_DIA.iva} (IVA), día {VTO_DIA.iibb} (IIBB), día {VTO_DIA.seh} (Seg. e Hig.) del mes siguiente
      </p>

      <div className="space-y-5">
        {pendientesPorSubtipo.map(({ subtipo, label, pendientes, total, vto, dias }) => {
          const vencido = dias < 0;
          const urgente = !vencido && dias <= 3;
          const proximo = !vencido && dias <= 7;

          return (
            <div key={subtipo} className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
              <div className={clsx(
                "px-6 py-4 border-b flex items-center gap-4 flex-wrap",
                vencido || urgente ? "border-red-100 bg-red-50" : proximo ? "border-amber-100 bg-amber-50" : "border-gray-100"
              )}>
                <div>
                  <h2 className="text-[15px] font-semibold text-gray-900">{label}</h2>
                  <p className={clsx(
                    "text-[12px] font-medium mt-0.5",
                    vencido || urgente ? "text-red-600" : proximo ? "text-amber-600" : "text-gray-500"
                  )}>
                    Vencimiento: {vto.toLocaleDateString("es-AR", { weekday: "short", day: "numeric", month: "long" })}
                    {" · "}
                    {vencido ? "vencido" : dias === 0 ? "hoy" : `${dias} días`}
                  </p>
                </div>
                <div className="ml-auto flex items-center gap-4 text-[12px]">
                  <span className="text-emerald-600 font-semibold">{total - pendientes.length}/{total} presentados</span>
                  {pendientes.length > 0 && (
                    <span className="text-red-500 font-semibold">{pendientes.length} pendientes</span>
                  )}
                </div>
              </div>

              {pendientes.length === 0 ? (
                <div className="py-8 text-center text-[13px] text-emerald-600 font-medium">
                  Todos presentados ✓
                </div>
              ) : (
                <table className="w-full text-[12px]">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-50 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
                      <th className="px-6 py-2.5 text-left">Cliente</th>
                      <th className="px-4 py-2.5 text-left">Estado</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {pendientes.map((s) => (
                      <tr key={s.cliente_id} className="hover:bg-gray-50/50 transition-colors">
                        <td className="px-6 py-2.5 text-gray-800 font-medium">{s.clientes?.nombre ?? "—"}</td>
                        <td className="px-4 py-2.5">
                          <span className="inline-flex items-center gap-1 text-[11px] font-medium bg-amber-50 text-amber-700 rounded-full px-2.5 py-1">
                            Pendiente
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
