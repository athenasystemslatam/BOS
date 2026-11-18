import { Document, Page, View, Text, StyleSheet } from "@react-pdf/renderer";

// Ficha "Tu facturación y tu categoría": una sola página A4 vertical, para que la persona
// la descargue y se la mande al cliente (BOS no la envía).

const BORDO = "#7A1F2E";
const TEXTO = "#1f2430";
const GRIS = "#6b7280";
const FONDO_CUADRO = "#f4f4f2";
const LINEA = "#e6e6e3";
const VERDE = "#2e7d5b";
const AMBAR = "#d29b1e";
const ROJO = "#c0392b";

export interface DatosFicha {
  nombre: string;
  cuit: string;
  categoria: string;
  tope: number;
  vigenteDesde: string; // dd/mm/aaaa
  total: number;
  pct: number; // 0..∞
  ventanaDesde: string; // dd/mm/aaaa
  ventanaHasta: string;
  mesControl: string; // "Noviembre 2026"
  umbral: number;
  deuda: { periodos: string | null; importe: string | null } | null;
  proximoControl: string; // "Diciembre 2026, cierre del semestre."
  generado: string; // dd/mm/aaaa
}

const s = StyleSheet.create({
  page: { fontFamily: "Helvetica", color: TEXTO, paddingBottom: 40 },
  franja: { height: 10, backgroundColor: BORDO },
  cuerpo: { paddingHorizontal: 54, paddingTop: 34 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", paddingBottom: 14, borderBottom: `1 solid ${LINEA}` },
  marca: { fontFamily: "Helvetica-Bold", fontSize: 11, color: BORDO, letterSpacing: 2.5, marginTop: 6 },
  hDer: { alignItems: "flex-end" },
  hDerSub: { fontSize: 9, color: GRIS },
  hDerMes: { fontSize: 9, fontFamily: "Helvetica-Bold", color: TEXTO, marginTop: 3 },
  titulo: { fontSize: 27, fontFamily: "Helvetica-Bold", marginTop: 44 },
  nombreFila: { flexDirection: "row", alignItems: "flex-end", marginTop: 12 },
  nombre: { fontSize: 14, fontFamily: "Helvetica-Bold" },
  cuit: { fontSize: 10.5, color: GRIS, marginLeft: 8, marginBottom: 1 },
  catFila: { flexDirection: "row", alignItems: "center", marginTop: 26 },
  insignia: { backgroundColor: BORDO, borderRadius: 18, paddingVertical: 9, paddingHorizontal: 22 },
  insigniaTxt: { color: "white", fontFamily: "Helvetica-Bold", fontSize: 13 },
  vigente: { fontSize: 9.5, color: GRIS, marginLeft: 16 },
  frase: { fontSize: 21, fontFamily: "Helvetica-Bold", marginTop: 52 },
  periodo: { fontSize: 10.5, color: GRIS, marginTop: 6 },
  barraCont: { marginTop: 26, height: 18, position: "relative" },
  barraFondo: { position: "absolute", left: 0, right: 0, top: 0, height: 18, borderRadius: 9, backgroundColor: "#ebeae7" },
  barraUso: { position: "absolute", left: 0, top: 0, height: 18, borderRadius: 9 },
  marca85: { position: "absolute", top: 0, width: 2, height: 18, backgroundColor: "white" },
  barraLeyenda: { flexDirection: "row", marginTop: 5, position: "relative", height: 10 },
  leyenda: { fontSize: 7.5, color: GRIS, position: "absolute", width: 40 },
  cuadros: { flexDirection: "row", marginTop: 18, gap: 14 },
  cuadro: { flex: 1, backgroundColor: FONDO_CUADRO, borderRadius: 10, paddingVertical: 20, paddingHorizontal: 14 },
  cuadroLbl: { fontSize: 7, fontFamily: "Helvetica-Bold", color: GRIS, letterSpacing: 1.2 },
  cuadroVal: { fontSize: 15, fontFamily: "Helvetica-Bold", marginTop: 16 },
  deuda: { marginTop: 32, backgroundColor: "#fff4dc", borderRadius: 10, borderLeft: `4 solid ${AMBAR}`, paddingVertical: 16, paddingHorizontal: 20 },
  deudaTit: { fontSize: 11, fontFamily: "Helvetica-Bold" },
  deudaTxt: { fontSize: 10, marginTop: 7 },
  deudaNota: { fontSize: 9.5, color: GRIS, marginTop: 7 },
  proxTit: { fontSize: 10.5, fontFamily: "Helvetica-Bold", marginTop: 30 },
  proxTxt: { fontSize: 10, color: GRIS, marginTop: 5 },
  pie: { position: "absolute", left: 54, right: 54, bottom: 36, borderTop: `1 solid ${LINEA}`, paddingTop: 9 },
  pieTxt: { fontSize: 7.5, color: GRIS, lineHeight: 1.45 },
  pieFecha: { fontSize: 7.5, color: GRIS, fontFamily: "Helvetica-Bold", marginTop: 1 },
});

const pesos = (n: number) => "$ " + n.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function FichaFacturacionPDF({ d }: { d: DatosFicha }) {
  const color = d.pct > 100 ? ROJO : d.pct >= d.umbral ? AMBAR : VERDE;
  const ancho = Math.max(0, Math.min(100, d.pct));
  const disponible = d.tope - d.total;
  const pctTexto = d.pct < 10 ? d.pct.toLocaleString("es-AR", { maximumFractionDigits: 1 }) : String(Math.round(d.pct));

  return (
    <Document title={`Control de facturación · ${d.nombre}`} author="KMA Consultores">
      <Page size="A4" style={s.page}>
        <View style={s.franja} />
        <View style={s.cuerpo}>
          <View style={s.header}>
            <Text style={s.marca}>KMA CONSULTORES</Text>
            <View style={s.hDer}>
              <Text style={s.hDerSub}>Control de facturación</Text>
              <Text style={s.hDerMes}>{d.mesControl}</Text>
            </View>
          </View>

          <Text style={s.titulo}>Tu facturación y tu categoría</Text>
          <View style={s.nombreFila}>
            <Text style={s.nombre}>{d.nombre}</Text>
            <Text style={s.cuit}>CUIT {d.cuit}</Text>
          </View>

          <View style={s.catFila}>
            <View style={s.insignia}><Text style={s.insigniaTxt}>Categoría {d.categoria}</Text></View>
            <Text style={s.vigente}>Tope vigente desde el {d.vigenteDesde}</Text>
          </View>

          <Text style={s.frase}>
            {d.pct > 100 ? `Superaste el tope de tu categoría (${pctTexto}%).` : `Usaste el ${pctTexto}% del tope de tu categoría.`}
          </Text>
          <Text style={s.periodo}>Facturación de los últimos 12 meses, del {d.ventanaDesde} al {d.ventanaHasta}.</Text>

          <View style={s.barraCont}>
            <View style={s.barraFondo} />
            <View style={[s.barraUso, { width: `${ancho}%`, backgroundColor: color }]} />
            <View style={[s.marca85, { left: `${d.umbral}%` }]} />
          </View>
          <View style={s.barraLeyenda}>
            <Text style={[s.leyenda, { left: 0 }]}>$ 0</Text>
            <Text style={[s.leyenda, { left: `${d.umbral}%`, marginLeft: -20, textAlign: "center" }]}>{`${d.umbral}%`}</Text>
            <Text style={[s.leyenda, { right: 0, textAlign: "right" }]}>Tope</Text>
          </View>

          <View style={s.cuadros}>
            <View style={s.cuadro}>
              <Text style={s.cuadroLbl}>FACTURADO (12 MESES)</Text>
              <Text style={s.cuadroVal}>{pesos(d.total)}</Text>
            </View>
            <View style={s.cuadro}>
              <Text style={s.cuadroLbl}>TOPE CATEGORÍA {d.categoria}</Text>
              <Text style={s.cuadroVal}>{pesos(d.tope)}</Text>
            </View>
            <View style={s.cuadro}>
              <Text style={s.cuadroLbl}>{disponible >= 0 ? "DISPONIBLE HASTA EL TOPE" : "EXCEDIDO DEL TOPE"}</Text>
              <Text style={[s.cuadroVal, { color: disponible >= 0 ? VERDE : ROJO }]}>{pesos(Math.abs(disponible))}</Text>
            </View>
          </View>

          {d.deuda && (
            <View style={s.deuda}>
              <Text style={s.deudaTit}>Cuotas de monotributo pendientes</Text>
              {d.deuda.periodos && <Text style={s.deudaTxt}>Períodos adeudados: {d.deuda.periodos}</Text>}
              {d.deuda.importe && <Text style={s.deudaTxt}>Importe: {d.deuda.importe}</Text>}
              <Text style={s.deudaNota}>Te recomendamos regularizarlas. Si necesitás el VEP, escribinos.</Text>
            </View>
          )}

          <Text style={s.proxTit}>Próximo control</Text>
          <Text style={s.proxTxt}>{d.proximoControl}</Text>
        </View>

        <View style={s.pie} fixed>
          <Text style={s.pieTxt}>Elaborado por KMA Consultores con los comprobantes emitidos descargados de ARCA hasta la fecha de corte.</Text>
          <Text style={s.pieTxt}>Valores de referencia: considera solo ingresos brutos facturados (no incluye superficie, energía eléctrica ni alquileres).</Text>
          <Text style={s.pieTxt}>La categoría que corresponde la determina ARCA al momento de recategorizar.</Text>
          <Text style={s.pieFecha}>Generado el {d.generado}</Text>
        </View>
      </Page>
    </Document>
  );
}
