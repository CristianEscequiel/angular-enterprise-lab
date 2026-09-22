import { TestBed } from '@angular/core/testing';
import { App } from './app';
import { LoadingService } from './core/services/loading.service';
import { MessageService } from './core/services/message.service';

describe('App', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
    }).compileComponents();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();
  });
  //Ejemplo basico de un test cumpliendo el AAA
  it('should be 4', () => {
    // Arrange
    const num1 = 1;
    const num2 = 3;
    //Act
    const result = num1 + num2;
    //Assert
    expect(result).toBe(4);
  });

  it('should render router-outlet', () => {
    const fixture = TestBed.createComponent(App);
    const compiled = fixture.nativeElement as HTMLElement;

    const routerOutlet = compiled.querySelector('router-outlet');

    expect(routerOutlet).toBeTruthy();
  });

  it('should render router-outlet whit css classes', () => {
    const fixture = TestBed.createComponent(App);
    const compiled = fixture.nativeElement as HTMLElement;

    const mainElement = compiled.querySelector('main');
    const mostHaveClasses = 'container p-lg sidebar-layout__content'.split(' ');
    //expect(mainElement?.classList.value).toBe(mostHaveClasses)
    mainElement?.classList.forEach((className) => {
      expect(mostHaveClasses).toContain(className);
    });
  });

  it('renders the app shell without a spurious title attribute', () => {
    const fixture = TestBed.createComponent(App);
    const compiled = fixture.nativeElement as HTMLElement;

    const shell = compiled.querySelector('app-shell');
    expect(shell).toBeTruthy();
    expect(shell?.hasAttribute('title')).toBe(false);
  });

  it('marks the app shell inert while a request is loading, to hide it from assistive tech behind the spinner overlay', () => {
    expect.assertions(2);
    const fixture = TestBed.createComponent(App);
    const compiled = fixture.nativeElement as HTMLElement;
    const loadingService = TestBed.inject(LoadingService);

    fixture.detectChanges();
    expect(compiled.querySelector('app-shell')?.hasAttribute('inert')).toBe(false);

    loadingService.show();
    fixture.detectChanges();

    expect(compiled.querySelector('app-shell')?.hasAttribute('inert')).toBe(true);
  });

  it('closing the toast clears the current message', () => {
    const fixture = TestBed.createComponent(App);
    const compiled = fixture.nativeElement as HTMLElement;
    const messageService = TestBed.inject(MessageService);

    messageService.showError('boom');
    fixture.detectChanges();

    const closeButton: HTMLButtonElement | null = compiled.querySelector('button.btn--close');
    if (!closeButton) throw new Error('No se renderizó el botón de cerrar el toast');
    closeButton.click();
    fixture.detectChanges();

    expect(messageService.message()).toBeNull();
  });
});
