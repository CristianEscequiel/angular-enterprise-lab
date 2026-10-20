import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';

import { AuthService } from '@core/auth/auth.service';
import { AboutPage } from './about-page';

@Component({ template: '' })
class PageStub {}

describe('AboutPage', () => {
  let fixture: ComponentFixture<AboutPage>;
  let httpMock: HttpTestingController;
  const isAuthenticated = signal(false);

  beforeEach(async () => {
    isAuthenticated.set(false);

    await TestBed.configureTestingModule({
      imports: [AboutPage],
      providers: [
        provideRouter([
          { path: 'login', component: PageStub },
          { path: 'dashboard', component: PageStub },
        ]),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: AuthService, useValue: { isAuthenticated: isAuthenticated.asReadonly() } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(AboutPage);
    httpMock = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
    await fixture.whenStable();
  });

  const root = (): HTMLElement => fixture.nativeElement;
  const all = <T extends Element>(selector: string): T[] =>
    Array.from(root().querySelectorAll<T>(selector));
  const h1 = (): HTMLElement | null => root().querySelector('h1');
  const text = (element: Element | null | undefined): string =>
    (element?.textContent ?? '').replace(/\s+/g, ' ').trim();
  const headingWith = (level: string, title: string): HTMLElement | undefined =>
    all<HTMLElement>(level).find((heading) => text(heading) === title);
  const cardOf = (heading: HTMLElement | undefined): Element | null =>
    heading?.closest('.card') ?? heading?.parentElement ?? null;
  const followsInDocument = (later: Node, earlier: Node): boolean =>
    Boolean(earlier.compareDocumentPosition(later) & Node.DOCUMENT_POSITION_FOLLOWING);
  const linksNamed = (label: string): HTMLAnchorElement[] =>
    all<HTMLAnchorElement>('a').filter((anchor) => text(anchor) === label);

  function signIn(): void {
    isAuthenticated.set(true);
    fixture.detectChanges();
  }

  it('REQ-1.3: renders without sending any HTTP request', () => {
    expect.assertions(1);

    expect(h1()).not.toBeNull();
    httpMock.expectNone(() => true);
    httpMock.verify();
  });

  describe('hero', () => {
    it('REQ-3.1: has a single level-1 heading "Centro de Gestión de Mantenimiento"', () => {
      expect.assertions(2);

      expect(all('h1')).toHaveLength(1);
      expect(text(h1())).toBe('Centro de Gestión de Mantenimiento');
    });

    it('REQ-3.2: shows a phrase with "órdenes de mantenimiento" below the h1', () => {
      const heading = h1();
      const phrase = all<HTMLElement>('p').find(
        (paragraph) => heading !== null && followsInDocument(paragraph, heading),
      );

      expect(text(phrase)).toContain('órdenes de mantenimiento');
    });
  });

  describe('order journey', () => {
    it('REQ-3.3: lists the five steps in an ordered list: crear, tomar, cerrar, liberar, cancelar', () => {
      expect.assertions(2);
      const steps = all<HTMLElement>('ol > li');

      expect(steps).toHaveLength(5);
      expect(steps.map((step) => text(step).toLowerCase().split(' ')[0])).toEqual([
        'crear',
        'tomar',
        'cerrar',
        'liberar',
        'cancelar',
      ]);
    });
  });

  it('REQ-3.4: contains no img, svg or picture elements', () => {
    expect.assertions(2);

    expect(h1()).not.toBeNull();
    expect(root().querySelector('img, svg, picture')).toBeNull();
  });

  describe('role cards', () => {
    const rolesExpected: [string, string[]][] = [
      [
        'Administrador',
        [
          'Editar órdenes',
          'Eliminar órdenes',
          'Liberar órdenes',
          'Cancelar órdenes',
          'Gestionar máquinas',
          'Gestionar técnicos',
        ],
      ],
      [
        'Team Leader de Mantenimiento',
        [
          'Crear órdenes preventivas y correctivas',
          'Editar órdenes',
          'Liberar órdenes',
          'Cancelar órdenes',
          'Gestionar máquinas',
          'Gestionar técnicos',
          'Gestionar equipos',
        ],
      ],
      ['Personal de Producción', ['Crear órdenes de pronto intervención']],
      ['Técnico', ['Tomar órdenes según su tipo de equipo', 'Cerrar las órdenes que tomó']],
    ];

    it('REQ-4.1: shows exactly four role cards (cards with an action list) with the expected titles', () => {
      expect.assertions(5);
      const cardsWithActions = all('.card').filter((card) => card.querySelector('ul') !== null);

      expect(cardsWithActions).toHaveLength(4);
      for (const [title] of rolesExpected) {
        expect(headingWith('h3', title)).toBeDefined();
      }
    });

    it.each(rolesExpected)(
      'REQ-4.2 to REQ-4.5: the card "%s" lists exactly its actions in the DOM',
      (title, actions) => {
        const list = cardOf(headingWith('h3', title))?.querySelector('ul');
        const items = list ? Array.from(list.querySelectorAll('li')) : [];

        expect(items.map((item) => text(item))).toEqual(actions);
      },
    );
  });

  describe('area cards', () => {
    const areas = [
      'Órdenes de trabajo',
      'Máquinas y partes',
      'Técnicos y equipos',
      'Tablero de turno',
    ];

    it.each(areas)('REQ-5.1 and REQ-5.2: the area "%s" has a title and a description', (title) => {
      expect.assertions(2);
      const heading = headingWith('h3', title);
      const description = text(cardOf(heading)).replace(title, '').trim();

      expect(heading).toBeDefined();
      expect(description.length).toBeGreaterThan(0);
    });
  });

  describe('without a session', () => {
    it('REQ-6.1: shows an "Iniciar sesión" link in the hero, next to the h1', () => {
      const heading = h1();
      const [first] = linksNamed('Iniciar sesión');

      expect(heading?.closest('section')?.contains(first ?? null)).toBe(true);
    });

    it('REQ-6.2: shows a second "Iniciar sesión" link at the end of the content', () => {
      expect.assertions(3);
      const links = linksNamed('Iniciar sesión');
      const lastCard = all<HTMLElement>('h3').at(-1);

      expect(links).toHaveLength(2);
      expect(lastCard).toBeDefined();
      expect(followsInDocument(links[1] ?? root(), lastCard ?? root())).toBe(true);
    });

    it('REQ-6.3: both "Iniciar sesión" links point to /login without returnUrl', () => {
      expect.assertions(3);
      const links = linksNamed('Iniciar sesión');

      expect(links).toHaveLength(2);
      expect(links.map((link) => link.getAttribute('href'))).toEqual(['/login', '/login']);
      expect(root().querySelector('a[href*="returnUrl"]')).toBeNull();
    });

    it('REQ-6.3: activating an "Iniciar sesión" link navigates to /login', async () => {
      expect.assertions(2);
      const [first] = linksNamed('Iniciar sesión');
      expect(first).toBeDefined();

      first?.click();
      await fixture.whenStable();

      expect(TestBed.inject(Router).url).toBe('/login');
    });

    it('REQ-6.5: does not show "Ir al tablero"', () => {
      expect.assertions(2);

      expect(h1()).not.toBeNull();
      expect(linksNamed('Ir al tablero')).toHaveLength(0);
    });
  });

  describe('with a session', () => {
    beforeEach(() => signIn());

    it('REQ-6.5: shows "Ir al tablero" instead of "Iniciar sesión"', () => {
      expect.assertions(2);

      expect(linksNamed('Ir al tablero').length).toBeGreaterThanOrEqual(1);
      expect(linksNamed('Iniciar sesión')).toHaveLength(0);
    });

    it('REQ-6.6: "Ir al tablero" points to /dashboard', () => {
      expect.assertions(2);
      const links = linksNamed('Ir al tablero');

      expect(links.length).toBeGreaterThanOrEqual(1);
      expect(links.every((link) => link.getAttribute('href') === '/dashboard')).toBe(true);
    });

    it('REQ-6.6: activating "Ir al tablero" navigates to /dashboard', async () => {
      expect.assertions(2);
      const [first] = linksNamed('Ir al tablero');
      expect(first).toBeDefined();

      first?.click();
      await fixture.whenStable();

      expect(TestBed.inject(Router).url).toBe('/dashboard');
    });
  });

  it('NFR-1: headings go h1 -> h2 -> h3 without skipping levels', () => {
    expect.assertions(4);
    const levels = all<HTMLElement>('h1, h2, h3, h4, h5, h6').map((heading) =>
      Number(heading.tagName.slice(1)),
    );
    const jumps = levels.filter(
      (level, index) => index > 0 && level - (levels[index - 1] ?? 0) > 1,
    );

    expect(levels[0]).toBe(1);
    expect(levels).toContain(2);
    expect(levels).toContain(3);
    expect(jumps).toEqual([]);
  });
});
