import { Link } from "../lib/Link";
import { Home } from "lucide-react";

export default function Breadcrumbs({ items }) {
  if (!items || items.length === 0) return null;

  return (
    <nav aria-label="Breadcrumb" className="breadcrumbs text-sm mb-6">
      <ul>
        <li>
          <Link to="/" aria-label="Home">
            <Home size={14} />
          </Link>
        </li>
        {items.map((item, index) => {
          const isLast = index === items.length - 1;
          return (
            <li key={index}>
              {isLast ? (
                <span aria-current="page" className="text-base-content font-medium">
                  {item.name}
                </span>
              ) : (
                <Link to={item.url}>{item.name}</Link>
              )}
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
