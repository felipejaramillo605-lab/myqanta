import { createFileRoute } from "@tanstack/react-router";
import { LegalLayout, LegalSection, LEGAL_CONTACT_EMAIL } from "@/components/legal-layout";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: "Política de Privacidad y Tratamiento de Datos — Qanta" },
      {
        name: "description",
        content:
          "Política de privacidad de Qanta conforme a la Ley 1581 de 2012 y el Decreto 1377 de 2013: datos recolectados, finalidades y derechos de Hábeas Data.",
      },
      { property: "og:title", content: "Política de Privacidad y Tratamiento de Datos — Qanta" },
      {
        property: "og:description",
        content:
          "Cómo Qanta recolecta, usa y protege tus datos personales, y cómo ejercer tus derechos de Hábeas Data ante la SIC.",
      },
      { property: "og:type", content: "article" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PrivacyPage,
});

function PrivacyPage() {
  return (
    <LegalLayout
      current="/privacy"
      title="Política de Privacidad y Tratamiento de Datos"
      subtitle="Esta política se expide en cumplimiento de la Ley 1581 de 2012, el Decreto 1377 de 2013 y demás normas colombianas sobre protección de datos personales y Hábeas Data. La autoridad de vigilancia es la Superintendencia de Industria y Comercio (SIC)."
    >
      <LegalSection title="1. Responsable del tratamiento">
        <p>
          Qanta es el responsable del tratamiento de los datos personales recolectados a través de la
          aplicación. Para cualquier solicitud relacionada con tus datos personales puedes escribir a{" "}
          <a
            href={`mailto:${LEGAL_CONTACT_EMAIL}`}
            className="text-foreground underline underline-offset-4"
          >
            {LEGAL_CONTACT_EMAIL}
          </a>
          , canal oficial de atención de peticiones, consultas y reclamos.
        </p>
      </LegalSection>

      <LegalSection title="2. Datos que recolectamos">
        <ul className="list-disc space-y-1.5 pl-5">
          <li>Datos de identificación: nombre completo, número de cédula, correo electrónico y teléfono.</li>
          <li>Fotografía de perfil o de carné del integrante del equipo, cuando el usuario la carga.</li>
          <li>
            Datos financieros y contables de la organización: cuentas, asientos, facturas, inventario,
            nómina y reportes que el usuario registra o carga en la aplicación.
          </li>
          <li>
            Datos provenientes de integraciones externas (por ejemplo Google o Notion) únicamente cuando
            el usuario conecta voluntariamente esa integración y autoriza los permisos solicitados.
          </li>
          <li>
            Datos técnicos de uso: fecha y hora de acceso, ruta consultada y metadatos de seguridad para
            detectar accesos indebidos.
          </li>
        </ul>
      </LegalSection>

      <LegalSection title="3. Finalidades del tratamiento">
        <ul className="list-disc space-y-1.5 pl-5">
          <li>Prestar el servicio y permitir el funcionamiento de los módulos contratados.</li>
          <li>Enviar notificaciones, recordatorios e invitaciones al correo indicado por el usuario.</li>
          <li>Cumplir las obligaciones contractuales y legales derivadas del uso de la plataforma.</li>
          <li>Mejorar el servicio, su seguridad, su desempeño y su experiencia de uso.</li>
          <li>Atender peticiones, consultas y reclamos de los titulares.</li>
        </ul>
      </LegalSection>

      <LegalSection title="4. Derechos del titular (Hábeas Data)">
        <p>Como titular de datos personales tienes derecho a:</p>
        <ul className="list-disc space-y-1.5 pl-5">
          <li>Conocer, actualizar y rectificar tus datos personales.</li>
          <li>Solicitar prueba de la autorización otorgada para el tratamiento.</li>
          <li>Ser informado sobre el uso que se ha dado a tus datos.</li>
          <li>Presentar quejas ante la Superintendencia de Industria y Comercio.</li>
          <li>Revocar la autorización otorgada.</li>
          <li>
            Solicitar la supresión del dato cuando no exista un deber legal o contractual de conservarlo.
          </li>
          <li>Acceder de forma gratuita a los datos que hayan sido objeto de tratamiento.</li>
        </ul>
        <p>
          Plazos de respuesta: las <strong className="text-foreground">consultas</strong> se atienden en un
          máximo de diez (10) días hábiles y los <strong className="text-foreground">reclamos</strong> en un
          máximo de quince (15) días hábiles, prorrogables en los términos de la ley cuando sea necesario,
          informando previamente al titular.
        </p>
      </LegalSection>

      <LegalSection title="5. Transferencia y transmisión a terceros">
        <p>
          Utilizamos proveedores de infraestructura tecnológica (alojamiento, base de datos y
          almacenamiento, operados sobre Supabase) que actúan como encargados del tratamiento bajo
          instrucciones de Qanta. Los datos se comparten con integraciones externas únicamente cuando el
          usuario las conecta y otorga su consentimiento explícito en ese momento. No vendemos ni cedemos
          datos personales con fines publicitarios.
        </p>
      </LegalSection>

      <LegalSection title="6. Seguridad de la información">
        <p>
          Aplicamos cifrado en tránsito (HTTPS/TLS) y cifrado en reposo en la base de datos y el
          almacenamiento de archivos, control de acceso por roles y permisos por módulo, aislamiento de
          datos por organización y registro de eventos de seguridad para detectar accesos indebidos.
        </p>
      </LegalSection>

      <LegalSection title="7. Vigencia">
        <p>
          Esta política rige desde su publicación y permanece vigente mientras Qanta realice tratamiento de
          datos personales. Las bases de datos se conservan durante la vigencia de la relación con el
          usuario y por los plazos legales aplicables. Cualquier cambio será publicado en esta misma página
          con su nueva fecha de actualización.
        </p>
      </LegalSection>
    </LegalLayout>
  );
}