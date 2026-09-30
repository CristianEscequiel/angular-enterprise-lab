import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { map, Observable, of } from 'rxjs';

import { API_BASE_URL } from '../config/api.config';
import { isLegajo, TechnicianProfile } from './auth.model';

// Lo mínimo que `core` necesita de un registro del maestro de técnicos. El modelo completo
// (`Technician`) vive en la feature `maintenance` y lo extiende.
export interface TechnicianDirectoryEntry extends TechnicianProfile {
  id: string;
  legajo: string;
}

// Único lugar que sabe cómo buscar un técnico por legajo en el maestro (`/tecnicos`).
//
// Se pide la colección entera y se filtra en el cliente porque JSON Server (1.0.0-beta.15) no deja
// otra salida, comprobado contra su código y contra `pnpm api`:
//   - `?legajo=1001` convierte el valor a número y no encuentra `"legajo": "1001"` (devuelve []);
//     tampoco hay sintaxis para forzar la comparación como string.
//   - `GET /tecnicos/:legajo` solo serviría si `id === legajo`, y eso no se puede garantizar: `POST`
//     descarta el `id` que mande el cliente y genera uno propio.
// Con el backend real (spec 018) esto pasa a ser `GET /tecnicos?legajo=…` y solo cambia este método.
//
// Devuelve `null` si no existe (o si el legajo ni siquiera tiene formato válido: no se arma ningún
// request). Un error de red o `5xx` se propaga: quien decide con esta respuesta no debe tomar un
// fallo como "no existe".
@Injectable({
  providedIn: 'root',
})
export class TechnicianDirectory {
  private readonly http = inject(HttpClient);

  find<T extends TechnicianDirectoryEntry = TechnicianDirectoryEntry>(
    legajo: string,
  ): Observable<T | null> {
    if (!isLegajo(legajo)) {
      return of(null);
    }

    return this.http
      .get<T[]>(`${API_BASE_URL}/tecnicos`)
      .pipe(map((technicians) => technicians.find((entry) => entry.legajo === legajo) ?? null));
  }
}
