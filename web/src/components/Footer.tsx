import { Link } from "react-router-dom";

export default function Footer() {
  return (
    <footer className="border-t border-gray-200 bg-gray-50 py-10 mt-16">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
          <div>
            <h3 className="text-sm font-semibold text-gray-900 mb-3">Gründungsdaten</h3>
            <ul className="space-y-2 text-sm text-gray-600">
              <li><Link to="/gruendung" className="hover:text-gray-900">Übersicht</Link></li>
              <li><Link to="/gruendung/foerderung" className="hover:text-gray-900">Förderprogramme</Link></li>
              <li><Link to="/research" className="hover:text-gray-900">Research</Link></li>
            </ul>
          </div>
          <div>
            <h3 className="text-sm font-semibold text-gray-900 mb-3">Developers</h3>
            <ul className="space-y-2 text-sm text-gray-600">
              <li><a href="/v1/docs" className="hover:text-gray-900">API Docs</a></li>
              <li><a href="/v1/openapi.json" className="hover:text-gray-900">OpenAPI</a></li>
            </ul>
          </div>
          <div className="col-span-2 md:col-span-2">
            <p className="text-sm text-gray-500">
              Sophex ist eine strukturierte Datenplattform für Gründer in Deutschland — mit Förderprogrammen,
              Rechtsformen, Behördeninformationen und mehr. Daten werden automatisiert gesammelt und regelmäßig
              aktualisiert.
            </p>
          </div>
        </div>
        <div className="mt-8 pt-8 border-t border-gray-200 text-xs text-gray-400">
          © {new Date().getFullYear()} Sophex. Alle Angaben ohne Gewähr.
        </div>
      </div>
    </footer>
  );
}
