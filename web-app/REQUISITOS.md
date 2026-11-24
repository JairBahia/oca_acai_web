# Revisão dos requisitos — Prática Extensionista VII

Esta revisão compara o código disponível com o enunciado. Não é uma certificação de nota e não substitui testes integrados em um ambiente de homologação ou a validação do estabelecimento.

| Requisito | Situação e limite encontrado |
| --- | --- |
| RF001 Cardápio | Implementado: categorias e busca assíncronas, nome, descrição, preço e imagem a partir da API. Consultas carregam produtos atualizados a cada 30 segundos. |
| RF002 Detalhes | Implementado: nome, descrição, preço, imagem e botão adicionar. Ingredientes dependem de dados cadastrados; produtos antigos podem não informá-los. |
| RF003 Carrinho | Implementado: itens, quantidades e contador permanecem durante navegação na página. O carrinho não persiste após recarregar. |
| RF004 Pedido | Implementado: revisão, nome e mesa, envio POST e número de acompanhamento. O valor é recalculado no servidor. Testar o fluxo completo em banco de homologação. |
| RF005 Login admin | Implementado com Firebase Auth e autorização por UID ou modo de avaliação por variável. Provedor Google depende de ativação e domínio autorizado no Firebase. |
| RF006 Produtos | Cadastro, edição e exclusão implementados. A imagem é informada por URL ou caminho existente; upload para serviço distribuído ainda não está implementado. |
| RF007 Pedidos | Listagem, filtro, atualização periódica e aviso visual implementados. A atualização por consulta a cada 10 segundos não é tempo real imediato; validar com diferentes sessões. |
| RF008 Status | Atualização e histórico com data e usuário implementados; acompanhamento do cliente consulta a API a cada 10 segundos. Pedidos antigos podem não ter histórico. |
| RF009 Swagger | Interface e OpenAPI disponíveis em `/api/docs` e `/api/openapi.json`. Documentação cobre rotas principais, mas precisa de exemplos e respostas mais detalhadas para o nível excelente. |

## Requisitos e entregas adicionais

- O backend é Node.js com API REST. O armazenamento existente é Firestore; o enunciado cita PostgreSQL, MySQL e MongoDB. Confirme a aceitação do Firestore com o professor.
- O repositório GitHub contém o código. A hospedagem precisa executar Node.js; GitHub Pages sozinho serve arquivos estáticos e não executa a API.
- Termo de concordância, avaliação pelo estabelecimento, relatório conforme modelo, identificação dos alunos e vídeo MP4 são entregas que dependem da equipe e do cliente.
- Acesso amplo a qualquer conta autenticada, quando habilitado, concede ao usuário acesso aos pedidos e permissão para modificar ou excluir produtos. Use banco separado para demonstração pública.
