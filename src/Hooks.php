<?php

namespace SimpleMaps;

use Parser;
use MediaWiki\MediaWikiServices;

class Hooks {
	public static function onParserFirstCallInit( Parser $parser ) {
		$contentLanguage = MediaWikiServices::getInstance()->getContentLanguage();
		$contentLanguage->mMagicExtensions['display_map'] = [ 0, 'display_map' ];

		$parser->setFunctionHook( 'display_map', [ ParserFunctionHandler::class, 'render' ], Parser::SFH_OBJECT_ARGS );
	}
}
