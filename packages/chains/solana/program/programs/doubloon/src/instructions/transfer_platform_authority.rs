use anchor_lang::prelude::*;
use crate::state::Platform;

#[derive(Accounts)]
pub struct TransferPlatformAuthority<'info> {
    #[account(
        constraint = authority.key() == platform.authority @ crate::errors::DoubloonError::Unauthorized
    )]
    pub authority: Signer<'info>,

    #[account(
        mut,
        seeds = [Platform::SEED],
        bump = platform.bump,
    )]
    pub platform: Account<'info, Platform>,
}

pub fn handler(ctx: Context<TransferPlatformAuthority>, new_authority: Pubkey) -> Result<()> {
    require!(new_authority != Pubkey::default(), crate::errors::DoubloonError::Unauthorized);
    ctx.accounts.platform.authority = new_authority;
    Ok(())
}
