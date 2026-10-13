-- ---------------------------------------------------------------------
-- VOLTA ATRÁS da migração das variações (produto pai / grade).
--
-- O que a migração fez
-- --------------------
-- Acrescentou quatro tabelas novas (product_groups, product_group_axes,
-- product_group_options, product_group_values) e três colunas em `products`:
-- `group_id`, `group_position` e `pending_group`.
--
-- Nada de existente foi alterado ou convertido: nenhum tipo mudou, nenhum dado
-- foi reescrito. Produto sem grupo se comporta exatamente como antes — essa
-- era a condição para a mudança subir sem regressão.
--
-- Por que desfazer não é automático
-- ---------------------------------
-- A migração da loja (server/src/schema.ts) é aditiva e só anda para a frente,
-- de propósito: ela roda sozinha a cada subida do servidor, e código que APAGA
-- coluna rodando sem ninguém olhando é como se perde dado de produção.
--
-- O QUE VOCÊ PERDE
-- ----------------
-- Todo o trabalho de agrupamento: quais produtos formam cada grupo, os eixos,
-- as opções, e o conteúdo de vitrine do grupo (nome, descrição, foto,
-- categoria). Os PRODUTOS continuam inteiros — preço, estoque, SKU e pedidos
-- nunca estiveram no grupo. A vitrine volta a mostrar um card por variação.
--
-- Perde-se também a fila de conferência: produto retido em `pending_group`
-- volta a aparecer na vitrine assim que a coluna sumir.
--
-- Faça o backup ANTES:
--
--   mysqldump -u USUARIO -p BANCO \
--     product_groups product_group_axes product_group_options \
--     product_group_values > variacoes-backup.sql
--
--   mysqldump -u USUARIO -p BANCO products > products-backup.sql
--
-- A ordem abaixo respeita as chaves estrangeiras: os valores primeiro, o
-- grupo por último.
-- ---------------------------------------------------------------------

DROP TABLE IF EXISTS product_group_values;
DROP TABLE IF EXISTS product_group_options;
DROP TABLE IF EXISTS product_group_axes;
DROP TABLE IF EXISTS product_groups;

ALTER TABLE products DROP COLUMN group_id;
ALTER TABLE products DROP COLUMN group_position;
ALTER TABLE products DROP COLUMN pending_group;
