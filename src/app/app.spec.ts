import { TestBed } from '@angular/core/testing';
import { App } from './app';

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
    expect(result).toBe(4)
  })

  it('should render router-outlet', () => {
    const fixture = TestBed.createComponent(App);
    const compiled = fixture.nativeElement as HTMLElement;

    const routerOutlet = compiled.querySelector('router-outlet')

    expect(routerOutlet).toBeTruthy()
  });

  it('should render router-outlet whit css classes', () => {
    const fixture = TestBed.createComponent(App);
    const compiled = fixture.nativeElement as HTMLElement;

    const mainElement = compiled.querySelector('main');
    const mostHaveClasses = 'container p-lg sidebar-layout__content'.split(' ')
    //expect(mainElement?.classList.value).toBe(mostHaveClasses)
    mainElement?.classList.forEach(className => {
      expect(mostHaveClasses).toContain(className)
    })
  })

  it('should render tittle in app shell', () => {

    const fixture = TestBed.createComponent(App);
    const compiled = fixture.nativeElement as HTMLElement;

    const mainElement = compiled.querySelector('app-shell');
    expect(mainElement).toBeTruthy();
    expect(mainElement?.getAttribute('title')).toBe('shell for testing')

  })


});
