#!/usr/bin/env python3
"""Busca o fechamento do mercado pecuário de SP (Scot Consultoria, publicado
pelo Notícias Agrícolas) e grava mercado.json na raiz do site.
Roda sozinho todo dia útil pelo GitHub Actions (.github/workflows/mercado.yml).
Se alguma cotação não puder ser lida, mantém o último valor conhecido."""
import html
import json
import re
import sys
import urllib.request
from datetime import datetime, timezone

BASE = 'https://www.noticiasagricolas.com.br/cotacoes/boi-gordo/'
UA = 'Mozilla/5.0 (compatible; RebanhoPucci/1.0; cotacao diaria)'
ARQ = sys.argv[1] if len(sys.argv) > 1 else 'mercado.json'

# chave, nome, página, como achar a linha de SP, coluna do valor, unidade
ITENS = [
    ('boi', 'Boi gordo', 'boi-gordo-scot-consultoria', 'municipio', 1, 'arroba'),
    ('vaca', 'Vaca gorda', 'boi-gordo-scot-consultoria', 'municipio', 3, 'arroba'),
    ('bezerro', 'Bezerro', 'macho-nelore-bezerro-12-meses', 'estado', 1, 'cabeca'),
    ('novilha', 'Novilha', 'femea-nelore-novilha-18-meses', 'estado', 1, 'cabeca'),
]


def baixar(pagina):
    req = urllib.request.Request(BASE + pagina, headers={'User-Agent': UA})
    with urllib.request.urlopen(req, timeout=40) as r:
        return r.read().decode('utf-8', 'replace')


def num(txt):
    return float(txt.strip().replace('.', '').replace(',', '.'))


def ler(s, tipo, col):
    """Primeira tabela da página (fechamento mais recente): média das linhas de SP."""
    i = s.find('<div class="cotacao">')
    if i < 0:
        raise ValueError('bloco de cotação não encontrado')
    bloco = s[i:s.find('</table>', i)]
    data = re.search(r'Fechamento:\s*(\d{2})/(\d{2})/(\d{4})', bloco)
    if not data:
        raise ValueError('data de fechamento não encontrada')
    valores = []
    for tr in re.findall(r'<tr[^>]*>(.*?)</tr>', bloco, re.S):
        cel = [html.unescape(re.sub(r'<[^>]+>', ' ', c)).strip() for c in re.findall(r'<td[^>]*>(.*?)</td>', tr, re.S)]
        cel = [re.sub(r'\s+', ' ', c) for c in cel]
        if len(cel) <= col:
            continue
        rotulo = cel[0]
        if (tipo == 'estado' and rotulo == 'SP') or (tipo == 'municipio' and rotulo.startswith('SP ')):
            valores.append(num(cel[col]))
    if not valores:
        raise ValueError('linha de SP não encontrada')
    d, m, a = data.groups()
    return round(sum(valores) / len(valores), 2), f'{a}-{m}-{d}'


def main():
    try:
        with open(ARQ, encoding='utf-8') as f:
            antigo = {x['chave']: x for x in json.load(f).get('itens', [])}
    except (OSError, ValueError):
        antigo = {}
    paginas, itens, falhas = {}, [], []
    for chave, nome, pagina, tipo, col, unidade in ITENS:
        try:
            if pagina not in paginas:
                paginas[pagina] = baixar(pagina)
            valor, fech = ler(paginas[pagina], tipo, col)
            itens.append({'chave': chave, 'nome': nome, 'valor': valor, 'unidade': unidade, 'fechamento': fech})
        except Exception as e:  # noqa: BLE001 - qualquer falha mantém o valor anterior
            falhas.append(f'{nome}: {e}')
            if chave in antigo:
                itens.append(antigo[chave])
    if not itens:
        print('Nenhuma cotação lida:', falhas)
        return 1
    novo = {'regiao': 'SP', 'fonte': 'Scot Consultoria via Notícias Agrícolas',
            'link': BASE + 'boi-gordo-scot-consultoria', 'itens': itens}
    if antigo and [antigo.get(x['chave']) for x in itens] == itens:
        print('Sem mudança.', falhas or '')
        return 0
    novo['atualizado_em'] = datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')
    with open(ARQ, 'w', encoding='utf-8') as f:
        json.dump(novo, f, ensure_ascii=False, indent=2)
        f.write('\n')
    print('Atualizado:', itens, falhas or '')
    return 0


if __name__ == '__main__':
    sys.exit(main())
