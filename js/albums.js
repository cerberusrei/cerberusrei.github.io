const ALBUM_LIST = [
    {
        id: '1OsvVblL0sYbaPyg-UTM2cKhb2ee8NdnE',
        name: '20240309 よさこいチーム八鹿 たびひろよさこい',
        cover: 'https://drive.google.com/thumbnail?authuser=0&sz=w1024&id=1wvzjVzGaWyJNhMR5n3zwQP3OJO6liDvC'
    },
    {
        id: '1W2cuENVhJSHxPRipEXX91yPaaxxSHaf1',
        name: '20240305 学生＆社会人よさこい2024',
        cover: 'https://drive.google.com/thumbnail?authuser=0&sz=w1024&id=1PMLMHpjvGW-0ZL-51aLPuTDDPOF0zpDZ'
    },
    {
        id: '18p1TEB6a8gaXW-GfS_hf-sITMm-Ha-95',
        name: '20240225 Vamos Live 2024 in Ninomiya',
        cover: 'https://drive.google.com/thumbnail?authuser=0&sz=w1024&id=1XBuZARWzhbqJKWgEC2b-77pK9XomWLJT'
    },
    {
        id: '1hX1HmOeio5gKPM50wa5b5ANeiR5m5q-q',
        name: '20240223 Rie kids大集合! Dance Showcase！',
        cover: 'https://drive.google.com/thumbnail?authuser=0&sz=w1024&id=1c10p0mEJkYNGHqRkPG7KqoP6f768-0M6'
    },
    {
        id: '1hlj9Ssass36FDEthuqpRD83tpeZoxo2M',
        name: '20240218 府中市コミュニティ文化祭',
        cover: 'https://drive.google.com/thumbnail?authuser=0&sz=w1024&id=1trbOAQbyutjfbOwA4A3VeUwF6VEEmJyC'
    },
    {
        id: '1g28Lf6pa6gJHdWoNYeIEJeA_Z_DDJjgl',
        name: '20240121 おでん&地酒フェス',
        cover: 'https://drive.google.com/thumbnail?authuser=0&sz=w1024&id=1yNBKqwn6lvGVwo5yFet787a3i_ww1-SO'
    },
    {
        id: '1L1bYBajGS3Lit4_ZI8YJJJm6ySwB4FqF',
        name: '20240120 福山城冬祭り',
        cover: 'https://drive.google.com/thumbnail?authuser=0&sz=w1024&id=18Y_Gj2YiFjpaVack8r0nnmPeGBVSH0P_'
    },
    {
        id: '1VcSgNmF8XaMaYwVw6arekybVio_JXMUT',
        name: '20240114 新春よさこい三昧',
        cover: 'https://drive.google.com/thumbnail?authuser=0&sz=w1024&id=1TMG5H3jHdTVwmfSJ7wYkd6Xt1DXa52rU'
    },
    {
        id: '1d9aNBtgvAn8Vs6_maotXnUTlwrkqyE8h',
        name: '20240113 ブランチ横浜南部市場',
        cover: 'https://drive.google.com/thumbnail?authuser=0&sz=w1024&id=1biRLSOQFQjnLnHlJqBXDj8li-HXJmtm7'
    },
    {
        id: '1-xfldIoFSGdfFjNN5IxOEcswYn83RmQd',
        name: '20240107 牡蠣フェス',
        cover: 'https://drive.google.com/thumbnail?authuser=0&sz=w1024&id=1z9SR8-rj5v6UK-LmRTGyqlKUYYAs_Eco'
    },
    {
        id: '1v6jX0gutlBmVirdYf_STc2J4Eh0I_JMb',
        name: '20240103 ほにや新春踊り初め',
        cover: 'https://drive.google.com/thumbnail?authuser=0&sz=w1024&id=12eaiuSENLomshTG1DAAp_Lb_CeMe1Gds'
    },
    {
        id: '1ij-w70f5FPkzX66bTVBkSeiiqrL8Tcro',
        name: '20231231 なんばカウントダウンパーティー',
        cover: 'https://drive.google.com/thumbnail?authuser=0&sz=w1024&id=11PKvLwEQvwXG2AddLTOsv1Gcat7-y82T'
    },
    {
        id: '1hjb6JkrW200eXHvHFKS_Wd7ReuJwBcBk',
        name: '20231223 冬のよさこいソーズラ祭り',
        cover: 'https://drive.google.com/thumbnail?authuser=0&sz=w1024&id=1XESgv3uZcXDC5ty2Qz27Ow5YlcJGH1MU'
    },
    {
        id: '1Kjb0pGCIUETtrQ7_DKV-BxY2U6rqTACd',
        name: '20231217 湘南ひらつかスターライトフェスティバル',
        cover: 'https://drive.google.com/thumbnail?authuser=0&sz=w1024&id=1fYi8mOgKWhgLVjqwu9ZDKhV_7PJNXtBN'
    },
    {
        id: '1yEP1q6aWjBDMVIWueyP5Sstz-7kFeYs_',
        name: '20231210 サクラタウンよさこい2023～師走祭～',
        cover: 'https://drive.google.com/thumbnail?authuser=0&sz=w1024&id=1z-2AGKelk0IGwhyl0V6IQJ7J-sd-j1Ai'
    },
    {
        id: '1NKJdfCvfeEb2dIVwTuoyRDQZ3ZPpIrDz',
        name: '20231203 よさこいご縁まつり',
        cover: 'https://drive.google.com/thumbnail?authuser=0&sz=w1024&id=1aGrCPWIauYubTGKStdc6L5iYb3p3Unea'
    },
    {
        id: '1hCZsVKKbp4I9E7bz7fsD87h9U3ApWbHT',
        name: '20231126 四日市よさこい祭り',
        cover: 'https://drive.google.com/thumbnail?authuser=0&sz=w1024&id=1o8ytoDgG_NHWRutoXrsjR17ZNCbsk3Ra'
    },
    {
        id: '1VBGFH-BBoHAVGHsEUDRDSvjJMKGixDo3',
        name: '20231125 水島よさこい',
        cover: 'https://drive.google.com/thumbnail?authuser=0&sz=w1024&id=1-eIsjy376mwKbA40SUE-hoFNi2e2x8P1'
    },
    {
        id: '1TUQXmu-WTHnEl2DyQnfhtgZ6glmmdA2a',
        name: '20231119 たびひろよさこい',
        cover: 'https://drive.google.com/thumbnail?authuser=0&sz=w1024&id=1ezsLYW_1Myajz6_fJzWmUBge1LJWZc0U'
    },
    {
        id: '1zH5tMEQ3q9JmJ2jYmW0veb0KR5xRP45I',
        name: '20231118 よさこいリターンズ'
    },
    {
        id: '1vYiZPAiLvMjHmZMs-C3YoNAVuNw8i1lq',
        name: '20231118 たびひろよさこい'
    },
    {
        id: '1fG_Yfi1FvV-lMDfrEB3DQl9C0qnZ9vMk',
        name: '20231115 龍馬生誕祭'
    },
    {
        id: '1lh1yd25uLq-sz8B2Kd_ShyvZWMWaxMuq',
        name: '20231112 よさこい東海道'
    },
    {
        id: '1n2nKP5PdAaTWpzCrbR69XcKqzAcCjBBt',
        name: '20231111 よさこい東海道'
    },
    {
        id: '1Yj2nrr3QXcnLZ42bRPX_KcGlAzH192_f',
        name: '20231105 ドリームよさこい'
    },
    {
        id: '1jBX2rZe6IAzFb-yYFBlZVJiVygEAXxrv',
        name: '20231105 座盆祭'
    },
    {
        id: '1Xg4goEmXJlQsOSHRzS1hucDq5R9kdtJi',
        name: '20231104 ドリームよさこい'
    },
    {
        id: '1sWRUgU16IIWMQXAvW4mLo2l9hOUp0JHR',
        name: '20231104 LOVE NUMAZU MUSICF AIR'
    },
    {
        id: '1HSGXW4t9Rz5xzBiTmdqG34-EX6VsZYPM',
        name: '20231103 YOSAKOIそうか～相思草愛～'
    },
    {
        id: '1-T2wBH9s4bDccn2soEbrpKSblEgbgaQY',
        name: '20231029 いずもだんだん祭り'
    },
    {
        id: '1Mmd20uNavMYMzHWwjiicnaWRSanjYl5F',
        name: '20231022 横浜よさこい祭り'
    },
    {
        id: '12z-xktEe99HpBKhLoYoyFY2KfjEL98iI',
        name: '20231021 よさこいご縁まつり'
    },
    {
        id: '130_X72dTeX5xI_dQ9HsH1lKVgVgeTkpp',
        name: '20231021 沼津キッチンカーフェス'
    },
    {
        id: '1zOZWzHFX4l6iP7gChpKqpmFaHCAzb262',
        name: '20231015 ゑぇじゃないか祭り'
    },
    {
        id: '1LSFJas8o_HsUmsUTAsxMOSN-aCYDL8Ln',
        name: '20231008 坂戶よさこい'
    },
    {
        id: '12GDjgO5MuENBmBkScgPVRZQR2TIP4EO3',
        name: '20231007 東京よさこい'
    },
    {
        id: '1HrQNjZIpxa4MyGEvozcM3im9gcXWQo56',
        name: '20231002 ちばYOSAKOI'
    },
    {
        id: '16nBUDFCYWIx1TUzLWdXKGtDPAbAT1MQo',
        name: '20230930 ひのよさこい'
    },
    {
        id: '1zH4p1I8h4INK4Utu89AdFuH5c-dpM_ZQ',
        name: '20230924 富山のよさこい祭り'
    },
    {
        id: '1nETp_FF38nyMFVGH5UPL1Sfl4CLgLGc4',
        name: '20230923 富山のよさこい祭り'
    },
    {
        id: '17JVJSxTcKWmpfULzHpnAzP4QX1CdJLzq',
        name: '20230918 渋谷ストリーム感謝祭'
    },
    {
        id: '18mmxEAn3gxKYxdtgVfVYJ3ZFjSV51XWz',
        name: '20230917 よさこい四万十'
    },
    {
        id: '14lkVqEc6D6_wdnIQ9AxHzlg6ytZm2iXk',
        name: '20230916 不破八幡宮大祭'
    },
    {
        id: '1nPSCEJm0kFr1lBNA7vSP_Xqh7yUeqglY',
        name: '20230910 こいや祭り'
    },
    {
        id: '1H1KOD3IFqIyTF5Vb1oeYdHvs1brwNacN',
        name: '20230909 こいや祭り'
    },
    {
        id: '1KhfZQrlL_TW4IJWfLIyIdJuB9HbZAmwl',
        name: '20230903 羽田エアポートガーデン'
    },
    {
        id: '12zp2V-NPSBsq97pSsMQX93taH5yv9ctC',
        name: '20230827 スパよさ'
    },
    {
        id: '1mFcV8ATpw0IMDQuuEhpV1COxJTJLIlI8',
        name: '20230826 スパよさ'
    },
    {
        id: '18Bec-kh3bFD3FIRNlKsWvtyp0W_nACj-',
        name: '20230820 ライオンズよさこい'
    },
    {
        id: '1OMw2FxZioAuy6RkTUULQA5-4IPq8MaiO',
        name: '20230819 ライオンズよさこい'
    },
    {
        id: '1NGpKjX5pr2hyoKIBoEazBYhy9drQVtE7',
        name: '20230812 高知よさこい祭り 後夜祭'
    },
    {
        id: '1KKLyKUJ_uDvMa316LicUDqF3NyiGnCIw',
        name: '20230811 高知よさこい祭り 本祭'
    },
    {
        id: '1KCNC8iZm0FKGTmDvQ6MOXnQLzNK8-0xz',
        name: '20230810 高知よさこい祭り 本祭'
    },
    {
        id: '1WkE-bpGpc6OIq9LzCtgYi5sa-9PQTAdC',
        name: '20230809 高知よさこい祭り 前夜祭'
    },
    {
        id: '16Dhkqbd00ZAj3hxkFnhaAZKDr4EEIbtx',
        name: '20230805 彩夏祭 本祭①'
    },
    {
        id: '1a13Yx4OS9F3S8sRNWC6r7FnL5KOxeDd2',
        name: '20230809 土佐学生よさこい大会'
    },
    {
        id: '1DvhX73GzruZ3UseWFo5LBLTq1hKqvycY',
        name: '20230806 彩夏祭 本祭２'
    },
    {
        id: '1jxKcXZLTzLKvIkW1NTO7rGhqiVdGcbK-',
        name: '20230610 YOSAKOIソーラン祭り'
    },
    {
        id: '1_rljZVbDPi5nC1yDUs8TcLXQsDB6LKXv',
        name: '20230402 さくよさ',
        cover: 'https://drive.google.com/thumbnail?authuser=0&sz=w1024&id=1XHOZhEc6Cq-b-8Y4bnhALvqxbGHnztEJ'
    },
    {
        id: '1ONe2fK-XFGutLYMin-vgKKcwNv3OpCEj',
        name: '20230401 さくよさ',
        cover: 'https://drive.google.com/thumbnail?authuser=0&sz=w1024&id=1l8blvemg_rEUWApJEjeasdsL5OeX2CtV'
    },
    {
        id: '1O7xmrDWWwYUDKVVT-OgSvlUwZ8XK2lQB',
        name: '20230312 虹よさ',
        cover: 'https://drive.google.com/thumbnail?authuser=0&sz=w1024&id=1zwuoyZE2AUbKDhnVBj4op31kscRLtEcs'
    }
];
