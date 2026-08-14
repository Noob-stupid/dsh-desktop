<img width="641" height="696" alt="576e3125-a190-4608-a42b-60010b6df02d" src="https://github.com/user-attachments/assets/bb7c1991-9346-4c20-8dc2-5d884515c522" />
<img width="642" height="696" alt="601b77fd-517d-4be4-b2c8-b25a13c3e852" src="https://github.com/user-attachments/assets/45a31794-ab56-4e34-8826-fb362deef3dc" />
<img width="642" height="695" alt="7efef08e-0326-47d3-bfa1-f55427fa6cb4" src="https://github.com/user-attachments/assets/e23560ca-41d3-4a83-bc14-1d20f884cd8a" />

# DSH GitHub Login 鈥斺€?鐙珛鐨?GitHub 鍙鍖栫櫥褰曟彃浠?

[![](https://img.shields.io/badge/powered_by-dsh-4D6BFE?style=flat-square&logo=deepseek&logoColor=white)](https://github.com/deepseek-ai/deepseek-harness)

涓€涓浂缁堢鐨?GitHub 鐧诲綍灏忓伐鍏凤細鎵撳紑绐楀彛 鈫?鐢熸垚璁惧鐮?鈫?鎺堟潈 鈫?瀹屾垚銆?
**璁惧鐮佹祦绋嬪湪绐楀彛鍐咃紙Chromium 缃戠粶鏍堬級鎵ц**锛屼笌浣犵殑娴忚鍣ㄥ叡鐢ㄥ悓涓€缃戠粶閫氶亾鈥斺€?
娴忚鍣ㄨ兘鎵撳紑 GitHub锛岃繖閲屽氨鑳藉畬鎴愮櫥褰曪紝涓嶅彈缁堢/浠ｇ悊閰嶇疆宸紓褰卞搷銆?

## 瀹夎锛圖SH 鎻掍欢妯″紡锛?

涓€鏉″懡浠よ杩?DSH锛屽苟鑷姩鍚敤瀹夸富绔彃浠讹紙鎻愪緵鐧诲綍鐘舵€佹帴鍙?+ 涓€閿敜璧风櫥褰曠獥鍙ｏ級锛?

```sh
dsh plugin --profile web add github:Noob-stupid/dsh-github-login
```

瀹夸富绔幆鍥炴帴鍙ｏ細

- `GET  /github-auth/status` 鈫?`{ok, loggedIn, login}`锛堝彧鍚处鍙峰悕锛岀粷涓嶄笅鍙戜护鐗岋級
- `POST /github-auth/open`   鈫?鍞よ捣鐧诲綍宸ュ叿绐楀彛锛堟湰鏈哄瓨鍦?exe 鏃剁洿鎺ュ惎鍔級

鐙珛宸ュ叿鐢ㄦ硶锛堜笉甯?DSH 涔熻锛夛細

## 鍔熻兘

- **绐楀彛鍐呮巿鏉?*锛氭巿鏉冮〉鐩存帴鍐呭祵鍦ㄧ獥鍙ｉ噷锛坄<webview>`锛夛紝甯?**鍓嶈繘 / 鍚庨€€ / 鍒锋柊** 鎸夐挳锛?
  涔熷彲浠ヤ竴閿敼鐢ㄥ閮ㄦ祻瑙堝櫒鎵撳紑锛?
- 鐧诲綍鎴愬姛鍚庝护鐗屼繚瀛樺湪 `~/.dsh/github-auth.json`锛?
- 鍚屾椂鍚屾杩?gh CLI 鐨?`~/.config/gh/hosts.yml`锛?*gh 鍛戒护琛岀珛鍗冲彲鐢?*锛坘eyring 瀛樺湪鏃?gh 浠?keyring 浼樺厛锛夛紱
- 鎵樼洏甯搁┗锛氶殢鏃舵煡鐪嬭处鍙风姸鎬?/ 涓€閿€€鍑虹櫥褰曪紱
- 澶嶇敤 GitHub CLI 鐨勫叕寮€ OAuth client_id锛坄178c6fc778ccc68e1d6a`锛夛紝鏉冮檺鑼冨洿
  `repo workflow gist read:org`銆?

## 鐢ㄦ硶

```sh
npm install        # 瀹夎 electron锛堝凡閰嶇疆鍥藉唴闀滃儚锛?
npm start          # 鐩存帴杩愯
npm run dist       # 鎵撳寘涓轰究鎼虹増鍗曟枃浠?exe锛坉ist/DSH-GitHub-Login.exe锛?
```

## 涓?dsh-plugin-hub 閰嶅

[dsh-plugin-hub](https://github.com/Noob-stupid/dsh-plugin-hub)锛堟彃浠剁鐞嗛潰鏉匡級浼氳鍙?
鏈伐鍏峰啓鍏ョ殑鍚屼竴浠戒护鐗屾枃浠讹細鐧诲綍鍚庨潰鏉跨殑 GitHub 甯傚満鏄剧ず"宸茬櫥褰?GitHub锛?璐﹀彿>"锛?
涓旀湇鍔＄鍥為€€閫氶亾鑷姩甯﹁璇侊紙鎼滅储閰嶉 10 鈫?30 娆?鍒嗛挓锛夈€?

## 闆嗘垚鍒板叾浠栧簲鐢紙濡傛闈㈠鎴风锛?

鎶婂畠褰撲綔涓€涓嫭绔嬭繘绋嬭皟鐢ㄥ嵆鍙細鐧诲綍鐘舵€侀€氳繃鍚屼竴浠芥枃浠讹紙`~/.dsh/github-auth.json`锛?
鍏变韩锛屼换浣?DSH 鐢熸€佸伐鍏烽兘鑳借鍙栵細

```js
spawn('<path>/DSH-GitHub-Login.exe', [], { windowsHide: false })
```

涔嬪悗鐢?`gh auth status` 鎴栫洿鎺ヨ鍙?`~/.dsh/github-auth.json` 楠岃瘉鐧诲綍鐘舵€併€?

## 鍘熺悊

GitHub Device Flow锛?

1. `POST https://github.com/login/device/code` 鈫?`user_code` + `device_code`
2. 鍦ㄧ獥鍙ｅ唴宓屾祻瑙堝櫒锛堟垨澶栭儴娴忚鍣級鎵撳紑 `https://github.com/login/device`锛岃緭鍏?`user_code` 鎺堟潈
3. 鎸?GitHub 缁欏嚭鐨?`interval` 杞 `POST https://github.com/login/oauth/access_token`
4. 鎷垮埌 `access_token` 鈫?涓昏繘绋嬭惤鐩?+ 鍐欏叆 gh 閰嶇疆

杞涓ユ牸閬靛惊鏈嶅姟鍣ㄩ棿闅旓紱缃戠粶鎶栧姩涓嶄腑鏂紙楠岃瘉鐮?15 鍒嗛挓鏈夋晥鏈燂級锛涙巿鏉冩垚鍔?
鍗冲畬鎴愶紝鐢ㄦ埛鍚嶆煡璇㈡槸灏藉姏鑰屼负鐨勮ˉ鍏呫€?

## 涓庢闈㈢鐨勫叧绯?

鏈粨搴?*鍙寘鍚櫥褰曟彃浠舵湰韬?*锛屼笉鍖呭惈浠讳綍妗岄潰瀹㈡埛绔唬鐮併€傛闈㈠鎴风鍙湪鏈湴
闆嗘垚瀹冿紙瑙佷笂锛夛紱涓よ€呴€氳繃浠ょ墝鏂囦欢鍏变韩鐧诲綍鐘舵€併€?

## 甯姪 / Help

閬囧埌闂鍏堢湅杩欓噷锛涗粛鏈夌枒闂鍒?[璁](https://github.com/Noob-stupid/dsh-github-login/issues) 鎻愰棶銆?

- **涓€鐩?绛夊緟鎺堟潈"**锛氳疆璇笌娴忚鍣ㄥ叡鐢ㄥ悓涓€缃戠粶閫氶亾锛屾祻瑙堝櫒鑳芥墦寮€ GitHub 灏变竴瀹氳兘瀹屾垚锛?
  鎻愮ず琛屼細鏄剧ず杞娆℃暟锛屽崱浣忔椂鎶婃彁绀烘枃瀛楀彂鍒?Issue銆?
- **鏄剧ず unknown**锛氭巿鏉冨凡鎴愬姛銆佷护鐗屽凡淇濆瓨锛屽彧鏄敤鎴峰悕鏌ヨ澶辫触锛涢噸鍚▼搴忓悗鐘舵€侀〉浼氶噸璇曘€?
- **gh 浠嶆樉绀烘湭鐧诲綍**锛氭湰宸ュ叿鍐欏叆 `~/.config/gh/hosts.yml`锛涜嫢绯荤粺 keyring 閲屾湁鏃у嚟璇侊紝
  gh 浼氫紭鍏堢敤 keyring鈥斺€斿厛 `gh auth logout` 娓呮帀鏃у嚟璇佸嵆鍙€?
- **濡備綍閫€鍑虹櫥褰?*锛氭墭鐩樿彍鍗?`GitHub: <璐﹀彿> (click to log out)`锛屾垨绐楀彛涓偣"閫€鍑虹櫥褰?銆?

## License

MIT
