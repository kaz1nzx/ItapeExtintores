-- Substituído por database/upgrade.sql.
--
-- A remessa com vários produtos agora faz parte da atualização cumulativa,
-- junto com o calendário de validades. Execute somente o upgrade.sql: ele já
-- inclui tudo o que este arquivo fazia, e pode ser rodado mesmo que este aqui
-- já tenha sido aplicado antes.
--
-- Este arquivo foi esvaziado de propósito: executá-lo depois do upgrade.sql
-- voltaria a função itape_private.apply_command para uma versão sem validades.
select 'Nada a fazer: execute database/upgrade.sql.' as aviso;
