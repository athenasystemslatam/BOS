import { Document, Page, View, Text, StyleSheet } from "@react-pdf/renderer";

const BORDO = "#7A2B2B";
const GRAY = "#6b7280";
const GRAY_BG = "#f9fafb";
const BORDER = "#e5e7eb";

const s = StyleSheet.create({
  page: { fontFamily: "Helvetica", fontSize: 10, color: "#1f2937" },
  header: { backgroundColor: BORDO, padding: "24 36 20 36" },
  hTitle: { fontSize: 18, fontFamily: "Helvetica-Bold", color: "white" },
  hSub: { fontSize: 11, color: "#f5d0d0", marginTop: 4 },
  hDate: { fontSize: 8, color: "#d0a0a0", marginTop: 10 },
  body: { padding: "20 36" },
  sectionLabel: {
    fontSize: 8, fontFamily: "Helvetica-Bold", color: GRAY,
    textTransform: "uppercase", letterSpacing: 1,
    marginTop: 18, marginBottom: 8,
  },
  statsRow: { flexDirection: "row", gap: 8 },
  statBox: {
    flex: 1, backgroundColor: GRAY_BG, borderRadius: 4,
    padding: "10 8", alignItems: "center",
    border: `1 solid ${BORDER}`,
  },
  statVal: { fontSize: 22, fontFamily: "Helvetica-Bold" },
  statLbl: { fontSize: 7, color: GRAY, marginTop: 2 },
  table: { border: `1 solid ${BORDER}`, borderRadius: 4, overflow: "hidden" },
  tHead: { flexDirection: "row", backgroundColor: "#f3f4f6", borderBottom: `1 solid ${BORDER}` },
  tRow: { flexDirection: "row", borderBottom: `1 solid ${GRAY_BG}` },
  tRowLast: { flexDirection: "row" },
  th: { padding: "5 8", fontSize: 8, fontFamily: "Helvetica-Bold", color: GRAY, textTransform: "uppercase" },
  td: { padding: "5 8", fontSize: 9 },
  c1: { flex: 3 }, c2: { flex: 1, textAlign: "center" },
  success: { color: "#16a34a" }, danger: { color: "#dc2626" }, warn: { color: "#d97706" },
  footer: {
    position: "absolute", bottom: 24, left: 36, right: 36,
    flexDirection: "row", justifyContent: "space-between",
    fontSize: 7, color: "#9ca3af",
    borderTop: `1 solid ${BORDER}`, paddingTop: 6,
  },
});

export interface ReporteData {
  periodo: { nombre_mes: string };
  total: number;
  completadas: number;
  enProceso: number;
  pendientes: number;
  avance: number;
  porLiquidadora: { nombre: string; total: number; recibosOk: number; f931Ok: number; pendientes: number }[];
  empresasPendientes: { nombre: string; falta: string[] }[];
  generadoEn: string;
}

export function ReportePDF({ data }: { data: ReporteData }) {
  const avanceColor = data.avance >= 80 ? s.success : data.avance >= 50 ? s.warn : s.danger;

  return (
    <Document>
      <Page size="A4" style={s.page}>
        {/* Header */}
        <View style={s.header}>
          <Text style={s.hTitle}>KMA Consultores</Text>
          <Text style={s.hSub}>Reporte de Liquidaciones — {data.periodo.nombre_mes}</Text>
          <Text style={s.hDate}>Generado el {data.generadoEn}</Text>
        </View>

        <View style={s.body}>
          {/* Stats */}
          <Text style={s.sectionLabel}>Resumen</Text>
          <View style={s.statsRow}>
            {[
              { val: String(data.total), lbl: "Total empresas", style: {} },
              { val: String(data.completadas), lbl: "Completadas", style: s.success },
              { val: String(data.enProceso), lbl: "En proceso", style: s.warn },
              { val: String(data.pendientes), lbl: "Pendientes", style: data.pendientes > 0 ? s.danger : s.success },
              { val: `${data.avance}%`, lbl: "Avance global", style: avanceColor },
            ].map((stat, i) => (
              <View key={i} style={s.statBox}>
                <Text style={[s.statVal, stat.style]}>{stat.val}</Text>
                <Text style={s.statLbl}>{stat.lbl}</Text>
              </View>
            ))}
          </View>

          {/* By liquidadora */}
          <Text style={s.sectionLabel}>Avance por liquidadora</Text>
          <View style={s.table}>
            <View style={s.tHead}>
              <Text style={[s.th, s.c1]}>Liquidadora</Text>
              <Text style={[s.th, s.c2]}>Empresas</Text>
              <Text style={[s.th, s.c2]}>Recibos</Text>
              <Text style={[s.th, s.c2]}>F.931</Text>
              <Text style={[s.th, s.c2]}>Pendientes</Text>
            </View>
            {data.porLiquidadora.map((liq, i) => (
              <View key={i} style={i === data.porLiquidadora.length - 1 ? s.tRowLast : s.tRow}>
                <Text style={[s.td, s.c1]}>{liq.nombre}</Text>
                <Text style={[s.td, s.c2]}>{liq.total}</Text>
                <Text style={[s.td, s.c2]}>{liq.recibosOk}/{liq.total}</Text>
                <Text style={[s.td, s.c2]}>{liq.f931Ok}/{liq.total}</Text>
                <Text style={[s.td, s.c2, liq.pendientes > 0 ? s.danger : s.success]}>
                  {liq.pendientes}
                </Text>
              </View>
            ))}
          </View>

          {/* Pending companies */}
          {data.empresasPendientes.length > 0 && (
            <>
              <Text style={s.sectionLabel}>
                Empresas pendientes al cierre ({data.empresasPendientes.length})
              </Text>
              <View style={s.table}>
                <View style={s.tHead}>
                  <Text style={[s.th, { flex: 3 }]}>Empresa</Text>
                  <Text style={[s.th, { flex: 2 }]}>Pendiente</Text>
                </View>
                {data.empresasPendientes.map((e, i) => (
                  <View key={i} style={i === data.empresasPendientes.length - 1 ? s.tRowLast : s.tRow}>
                    <Text style={[s.td, { flex: 3 }]}>{e.nombre}</Text>
                    <Text style={[s.td, { flex: 2 }, s.danger]}>{e.falta.join(", ")}</Text>
                  </View>
                ))}
              </View>
            </>
          )}
        </View>

        {/* Footer */}
        <View style={s.footer} fixed>
          <Text>BOS · Sistema de seguimiento de liquidaciones</Text>
          <Text>KMA Consultores</Text>
        </View>
      </Page>
    </Document>
  );
}
