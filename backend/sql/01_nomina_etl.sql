IF OBJECT_ID('dbo.NominaDetalle', 'U') IS NOT NULL
    DROP TABLE dbo.NominaDetalle;
GO

CREATE TABLE dbo.NominaDetalle (
    id BIGINT IDENTITY(1,1) NOT NULL PRIMARY KEY,
    anomes VARCHAR(6) NULL,
    correl VARCHAR(2) NULL,
    id_periodo INT NULL,
    emp_codigo VARCHAR(20) NULL,
    emp_descri NVARCHAR(200) NULL,
    emp_ruc VARCHAR(20) NULL,
    emp_dirfis NVARCHAR(250) NULL,
    id_remune INT NULL,
    rem_codigo VARCHAR(20) NULL,
    rem_descri NVARCHAR(150) NULL,
    rem_anomes VARCHAR(6) NULL,
    rem_correl VARCHAR(2) NULL,
    rem_fecini VARCHAR(10) NULL,
    rem_fecfin VARCHAR(10) NULL,
    id_traba INT NULL,
    tra_codigo VARCHAR(20) NULL,
    tra_apepat NVARCHAR(100) NULL,
    tra_apemat NVARCHAR(100) NULL,
    tra_nombre NVARCHAR(100) NULL,
    tra_nrodni VARCHAR(11) NULL,
    SdoBasico DECIMAL(18,2) NULL,
    SdoBasFam DECIMAL(18,2) NULL,
    DiaBasico DECIMAL(18,2) NULL,
    id_tipemp INT NULL,
    tip_codigo VARCHAR(20) NULL,
    tip_descri NVARCHAR(100) NULL,
    id_ocupac INT NULL,
    ocu_codigo VARCHAR(20) NULL,
    ocu_descri NVARCHAR(150) NULL,
    id_regimen INT NULL,
    reg_codigo VARCHAR(20) NULL,
    reg_descri NVARCHAR(100) NULL,
    reg_fecins VARCHAR(10) NULL,
    tra_nroafp VARCHAR(30) NULL,
    id_dias INT NULL,
    Tipo VARCHAR(20) NULL,
    Stip VARCHAR(40) NULL,
    id_concep INT NULL,
    con_codigo VARCHAR(20) NULL,
    con_descri NVARCHAR(150) NULL,
    Ingresos DECIMAL(18,2) NULL,
    Descuentos DECIMAL(18,2) NULL,
    Neto DECIMAL(18,2) NULL,
    Horas DECIMAL(8,2) NULL,
    hor_descri NVARCHAR(150) NULL,
    per_fecini VARCHAR(10) NULL,
    per_fecret VARCHAR(10) NULL,
    Est_Emple VARCHAR(5) NULL,
    tra_nroipss VARCHAR(30) NULL,
    cc_codigo VARCHAR(20) NULL,
    cc_descri NVARCHAR(150) NULL,
    totDias INT NULL,
    totHoras DECIMAL(8,2) NULL,
    totDiasFalta INT NULL,
    todDiasDMedi INT NULL,
    totHorasSob DECIMAL(8,2) NULL,
    totMinuto INT NULL,
    totMinutoSob INT NULL
);
GO

CREATE INDEX IX_NominaDetalle_periodo ON dbo.NominaDetalle (anomes, correl, id_traba);
GO

IF OBJECT_ID('dbo.NominaPeriodo', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.NominaPeriodo (
        id_periodo INT NOT NULL PRIMARY KEY,
        emp_codigo VARCHAR(5) NULL,
        id_remune INT NULL,
        rem_anomes VARCHAR(6) NULL,
        rem_correl VARCHAR(2) NULL,
        rem_fecini VARCHAR(8) NULL,
        rem_fecfin VARCHAR(8) NULL,
        st_anulado VARCHAR(1) NULL
    );
END;
GO

IF OBJECT_ID('dbo.usp_Nomina_Sincronizar', 'P') IS NOT NULL
    DROP PROCEDURE dbo.usp_Nomina_Sincronizar;
GO

CREATE PROCEDURE dbo.usp_Nomina_Sincronizar
    @anomes VARCHAR(6),
    @correl VARCHAR(2),
    @emp_codigo VARCHAR(5) = '003',
    @id_remune INT = 1
AS
BEGIN
    SET NOCOUNT ON;

    -- 1) Refrescar catalogo de periodos (solo lectura sobre el ERP)
    DELETE FROM dbo.NominaPeriodo WHERE emp_codigo = @emp_codigo AND id_remune = @id_remune;

    INSERT INTO dbo.NominaPeriodo (id_periodo, emp_codigo, id_remune, rem_anomes, rem_correl, rem_fecini, rem_fecfin, st_anulado)
    SELECT id_periodo, emp_codigo, id_remune, rem_anomes, rem_correl, rem_fecini, rem_fecfin, st_anulado
    FROM [ERP_101013].[dbGP_2024_GP].[dbo].[MA002101]
    WHERE emp_codigo = @emp_codigo AND id_remune = @id_remune;

    -- 2) Materializar detalle del periodo (el SP del ERP corre una sola vez)
    DELETE FROM dbo.NominaDetalle WHERE anomes = @anomes AND correl = @correl;

    DECLARE @prevMax BIGINT = ISNULL((SELECT MAX(id) FROM dbo.NominaDetalle), 0);
    DECLARE @per_codigo VARCHAR(9) = @anomes + '/' + @correl;

    INSERT INTO dbo.NominaDetalle (
        id_periodo, emp_codigo, emp_descri, emp_ruc, emp_dirfis, id_remune, rem_codigo, rem_descri,
        rem_anomes, rem_correl, rem_fecini, rem_fecfin, id_traba, tra_codigo, tra_apepat, tra_apemat,
        tra_nombre, tra_nrodni, SdoBasico, SdoBasFam, DiaBasico, id_tipemp, tip_codigo, tip_descri,
        id_ocupac, ocu_codigo, ocu_descri, id_regimen, reg_codigo, reg_descri, reg_fecins, tra_nroafp,
        id_dias, Tipo, Stip, id_concep, con_codigo, con_descri, Ingresos, Descuentos, Neto, Horas,
        hor_descri, per_fecini, per_fecret, Est_Emple, tra_nroipss, cc_codigo, cc_descri, totDias,
        totHoras, totDiasFalta, todDiasDMedi, totHorasSob, totMinuto, totMinutoSob
    )
    EXEC [ERP_101013].[dbGP_2024_GP].[dbo].[rpt_BolePagoPlame]
        @Tipo='01', @id_remune=@id_remune, @tra_tsel='Tod', @id_traba=0,
        @cen_tsel='Tod', @id_cencos=0, @per_TSel='Ran',
        @per_codigo=@per_codigo, @emp_codigo=@emp_codigo, @user_id=NULL;

    -- 3) Sellar el periodo sobre las filas recien insertadas
    UPDATE dbo.NominaDetalle
    SET anomes = @anomes, correl = @correl
    WHERE id > @prevMax;
END;
GO