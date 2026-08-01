import { createFileRoute } from "@tanstack/react-router";
import { LegalLayout, LegalSection, LEGAL_CONTACT_EMAIL } from "@/components/legal-layout";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { ShieldAlert } from "lucide-react";

export const Route = createFileRoute("/terms")({
  head: () => ({
    meta: [
      { title: "Términos y Condiciones — Qanta" },
      {
        name: "description",
        content:
          "Términos y condiciones de uso de Qanta, incluido el descargo de responsabilidad frente a la DIAN y entidades de vigilancia financiera en Colombia.",
      },
      { property: "og:title", content: "Términos y Condiciones — Qanta" },
      {
        property: "og:description",
        content:
          "Condiciones de uso, responsabilidad del usuario, propiedad intelectual y descargo DIAN de Qanta.",
      },
      { property: "og:type", content: "article" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: TermsPage,
});

function TermsPage() {
  return (
    <LegalLayout
      current="/terms"
      title="Términos y Condiciones"
      subtitle="Al crear una cuenta o usar Qanta aceptas estos términos. Si no estás de acuerdo con ellos, no debes usar la aplicación."
    >
      <LegalSection title="Descargo importante">
        <Alert className="border-destructive/50 bg-destructive/5">
          <ShieldAlert className="size-4 text-destructive" />
          <AlertTitle className="text-foreground">Qanta no es una entidad certificada</AlertTitle>
          <AlertDescription className="leading-6">
            Qanta es una herramienta de gestión personal y organizacional.{" "}
            <strong className="text-foreground">
              No estamos certificados por la DIAN, la Superintendencia Financiera de Colombia, ni ninguna
              otra entidad de vigilancia contable, tributaria o financiera.
            </strong>{" "}
            La aplicación es de uso personal e informativo: no sustituye la asesoría de un contador público,
            revisor fiscal o asesor financiero certificado, ni garantiza el cumplimiento de obligaciones
            tributarias o contables formales ante autoridades colombianas. El plan de cuentas, los asientos
            contables y los reportes generados son herramientas de apoyo, no documentos oficiales
            certificados.
          </AlertDescription>
        </Alert>
      </LegalSection>

      <LegalSection title="1. Objeto del servicio">
        <p>
          Qanta es una plataforma de gestión que reúne módulos de finanzas, inventario, ventas, CRM,
          proyectos, equipo, documentos, agenda y reportes, con funciones de asistencia por inteligencia
          artificial. El servicio se presta &quot;tal cual&quot; y puede evolucionar, incorporando o
          retirando funcionalidades.
        </p>
      </LegalSection>

      <LegalSection title="2. Condiciones de uso">
        <ul className="list-disc space-y-1.5 pl-5">
          <li>Debes ser mayor de edad y tener capacidad legal para contratar.</li>
          <li>Eres responsable de la confidencialidad de tus credenciales de acceso.</li>
          <li>
            No puedes usar la plataforma para actividades ilícitas, para vulnerar su seguridad, para acceder
            a datos de otras organizaciones ni para automatizar cargas que degraden el servicio.
          </li>
          <li>
            El uso de integraciones externas está sujeto además a los términos del proveedor
            correspondiente.
          </li>
        </ul>
      </LegalSection>

      <LegalSection title="3. Responsabilidad del usuario sobre los datos">
        <p>
          El usuario es el único responsable de la veracidad, exactitud, legalidad y actualización de los
          datos que ingresa o carga en la aplicación, incluidos datos de terceros, cifras contables,
          documentos soporte y datos personales de integrantes del equipo, para los cuales declara contar con
          la autorización requerida por la ley.
        </p>
      </LegalSection>

      <LegalSection title="4. Limitación de responsabilidad">
        <p>
          En la máxima medida permitida por la ley, Qanta no responde por lucro cesante, pérdida de datos,
          sanciones tributarias, decisiones de negocio ni daños indirectos o consecuenciales derivados del
          uso o la imposibilidad de uso de la plataforma, ni por errores en la información ingresada por el
          usuario o generada automáticamente y no revisada por él.
        </p>
      </LegalSection>

      <LegalSection title="5. Propiedad intelectual">
        <p>
          El software, la marca, el diseño y la documentación de Qanta son de su titular y están protegidos
          por la normativa de propiedad intelectual. El usuario conserva la titularidad de los datos y
          contenidos que carga, y otorga a Qanta una licencia limitada para procesarlos con el único fin de
          prestar el servicio.
        </p>
      </LegalSection>

      <LegalSection title="6. Terminación de la cuenta">
        <p>
          El usuario puede solicitar la terminación de su cuenta en cualquier momento. Qanta puede suspender
          o terminar cuentas que incumplan estos términos o que representen un riesgo de seguridad,
          notificando cuando sea posible. Tras la terminación, los datos se eliminan o se conservan
          únicamente por los plazos legales aplicables.
        </p>
      </LegalSection>

      <LegalSection title="7. Ley aplicable y jurisdicción">
        <p>
          Estos términos se rigen por la ley colombiana. Cualquier controversia se someterá a los jueces y
          tribunales competentes de Colombia.
        </p>
      </LegalSection>

      <LegalSection title="8. Contacto">
        <p>
          Para notificaciones, peticiones o reclamos:{" "}
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