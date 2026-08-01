import { createFileRoute } from "@tanstack/react-router";
import { LegalLayout, LegalSection, LEGAL_CONTACT_EMAIL } from "@/components/legal-layout";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { TriangleAlert } from "lucide-react";

export const Route = createFileRoute("/ai-policy")({
  head: () => ({
    meta: [
      { title: "Uso de Inteligencia Artificial — Qanta" },
      {
        name: "description",
        content:
          "Cómo Qanta usa inteligencia artificial: qué datos se procesan, límites del asistente y por qué toda acción contable generada por IA debe ser revisada.",
      },
      { property: "og:title", content: "Uso de Inteligencia Artificial — Qanta" },
      {
        property: "og:description",
        content:
          "Transparencia sobre el asistente de IA de Qanta: datos procesados, control del usuario y revisión obligatoria de asientos contables.",
      },
      { property: "og:type", content: "article" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AiPolicyPage,
});

function AiPolicyPage() {
  return (
    <LegalLayout
      current="/ai-policy"
      title="Uso de Inteligencia Artificial"
      subtitle="Qanta incorpora funciones de inteligencia artificial para agilizar tareas operativas y contables. Esta página explica cómo funcionan, qué datos se procesan y cuáles son sus límites."
    >
      <LegalSection title="1. Qué hace la IA en Qanta">
        <p>
          Qanta incluye un asistente conversacional que puede ejecutar acciones dentro de tu organización a
          partir de tus instrucciones, entre ellas:
        </p>
        <ul className="list-disc space-y-1.5 pl-5">
          <li>Agendar eventos, tareas y recordatorios.</li>
          <li>Solicitar la creación de integrantes del equipo (empleados) sujeta a aprobación.</li>
          <li>Ajustar existencias de inventario.</li>
          <li>Registrar asientos contables de compras y gastos.</li>
          <li>
            Extraer datos de facturas y extractos bancarios mediante reconocimiento óptico de caracteres
            (OCR) sobre las imágenes o documentos que cargas.
          </li>
          <li>Buscar documentos y consultar información de los módulos a los que tienes acceso.</li>
        </ul>
      </LegalSection>

      <LegalSection title="2. Datos enviados a los proveedores de IA">
        <p>
          Para procesar cada solicitud enviamos únicamente los datos mínimos necesarios: el texto de tu
          consulta, la imagen o documento que adjuntes y un contexto acotado de tu organización (por
          ejemplo, nombre de la organización, cuentas contables o productos relevantes). No enviamos bases
          de datos completas ni datos de otras organizaciones.
        </p>
        <p>
          Los datos procesados no se utilizan para entrenar modelos de terceros, salvo que el usuario lo
          autorice expresamente. El acceso a los modelos se realiza a través de proveedores de inteligencia
          artificial que actúan como encargados del tratamiento.
        </p>
      </LegalSection>

      <LegalSection title="3. La IA puede cometer errores">
        <Alert className="border-destructive/40 bg-destructive/5">
          <TriangleAlert className="size-4 text-destructive" />
          <AlertTitle className="text-foreground">Revisa siempre los resultados</AlertTitle>
          <AlertDescription className="leading-6">
            Toda acción contable o financiera generada por el asistente —asientos, montos, cuentas,
            terceros y clasificación de gastos— debe ser revisada y validada por el usuario antes de
            considerarse definitiva. Esto aplica en especial a los asientos que quedan en estado
            <strong className="text-foreground"> borrador</strong> pendientes de factura o soporte: no son
            registros confirmados hasta que tú los verifiques y apruebes.
          </AlertDescription>
        </Alert>
      </LegalSection>

      <LegalSection title="4. Control del usuario">
        <p>
          Mantienes el control total sobre lo que hace el asistente. Cada acción ejecutada queda registrada
          y puede ser consultada, corregida o eliminada por el usuario con permisos suficientes. El acceso a
          las herramientas del asistente está restringido por rol y por módulo, y puedes optar por no usar
          el asistente en ningún momento.
        </p>
      </LegalSection>

      <LegalSection title="5. El asistente no es asesoría profesional">
        <p>
          Las respuestas y acciones del asistente tienen carácter informativo y de apoyo operativo. No
          constituyen ni reemplazan la asesoría contable, financiera, tributaria o legal de un profesional
          certificado. Las decisiones y su responsabilidad son siempre del usuario.
        </p>
        <p>
          Dudas sobre esta política:{" "}
          <a
            href={`mailto:${LEGAL_CONTACT_EMAIL}`}
            className="text-foreground underline underline-offset-4"
          >
            {LEGAL_CONTACT_EMAIL}
          </a>
          .
        </p>
      </LegalSection>
    </LegalLayout>
  );
}